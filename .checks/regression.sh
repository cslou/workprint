#!/usr/bin/env bash
set -euo pipefail
exec python3 - "$0" "$@" <<'PY'
import time
started = time.monotonic()
import argparse, json, math, os, re, resource, signal, subprocess, sys, tempfile
from pathlib import Path

# Adapt only to verified repo commands; keep lists out of event wrappers.
# Tier map and inventory: docs/regression-gates.md. The test stack's lifecycle lives inside
# stack-suites; setup records a resource baseline and teardown fails on anything this run left behind.
# Steps print 'NOTICE:' lines for non-blocking results the final report must carry.
BASELINE = '.checks/.logs/stack-baseline.json'
COMPILED = ['env', 'WORKPRINT_TESTS_COMPILED=1']
COMMANDS = {
    # Compile the tests once; later groups reuse the build.
    'setup': ['sh', '-c', 'node scripts/test-stack-leftovers.mjs baseline ' + BASELINE
              + ' && pnpm exec node scripts/test.mjs compile'],
    'check': ['pnpm', 'check'],
    'unit': COMPILED + ['pnpm', 'test:unit'],
    'build': ['pnpm', 'build'],
    'tooling': COMPILED + ['pnpm', 'test:tooling'],
    # One shared stack for integration and browser journeys.
    'stack-suites': COMPILED + ['pnpm', 'exec', 'node', 'scripts/test-stack.mjs', 'sh', '-c',
                                'node scripts/test.mjs integration'
                                ' || { echo "NOTICE: integration failed; browser journeys not run"; exit 1; }; '
                                'playwright test --config test/e2e/playwright.config.ts'
                                ' || { echo "NOTICE: browser journeys failed after integration passed"; exit 1; }'],
    'audit': ['node', 'scripts/audit.mjs'],
    'teardown': ['node', 'scripts/test-stack-leftovers.mjs', 'verify', BASELINE],
}
TIERS = {'quick': ['check', 'unit'], 'standard': ['check', 'unit', 'build', 'tooling'],
         'deep': ['check', 'unit', 'build', 'tooling', 'stack-suites', 'audit']}
UNCONFIGURED = ['full', 'routine']
os.chdir(Path(sys.argv[1]).resolve().parent.parent)
parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument('--tier', choices=[*TIERS, *UNCONFIGURED])
mode.add_argument('--merge', action='store_true')
parser.add_argument('--base')
parser.add_argument('--head')
parser.add_argument('--budget-seconds', type=float)
parser.add_argument('--exception')
args = parser.parse_args(sys.argv[2:])
marker = Path('.checks/.incomplete.json')
record = None
interruption = False

class GateFailure(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code

ERRORS = (GateFailure, ValueError, KeyError, TypeError, OSError)

def require(condition, message):
    if not condition:
        raise ValueError(message)

def number(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0

def interrupted(signum, frame):
    global interruption
    interruption = True  # Never throw between launch/registration or interrupt owned cleanup.

def group_alive(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False

def notices():
    found = []
    for path in sorted(logs.iterdir(), key=lambda item: int(item.name.split('-')[0])):
        found += [line.rstrip() for line in path.read_text(errors='replace').splitlines() if line.startswith('NOTICE:')]
    return found

def run(argv, label, capture=False, cleaning=False):
    if interruption and not cleaning:
        raise GateFailure('interrupted', 130)
    cutoff = work_deadline
    if cleaning:
        cutoff = min(deadline - cleanup, time.monotonic() + teardown)
    if time.monotonic() >= cutoff:
        raise GateFailure('budget exhausted before ' + label, 124)
    path = logs / (str(len(list(logs.iterdir()))) + '-' + label + '.log')
    print('-> ' + label + ' log=' + str(path), flush=True)
    problem = None
    leftovers = False
    with path.open('w') as output:
        child = subprocess.Popen(argv, stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
                                 env={**os.environ, 'CHECKS_JOBS': str(limits['jobs'])},
                                 preexec_fn=lambda: resource.setrlimit(resource.RLIMIT_NOFILE,
                                                        (limits['open_files'], limits['open_files'])))
        try:
            # Handled signals only latch until ownership is protected by this finally.
            while True:
                if interruption and not cleaning:
                    raise GateFailure('interrupted', 130)
                remaining = cutoff - time.monotonic()
                if remaining <= 0:
                    raise GateFailure('budget exhausted during ' + label, 124)
                try:
                    child.wait(timeout=min(0.05, remaining))
                    break
                except subprocess.TimeoutExpired:
                    continue
            if child.returncode:
                raise GateFailure(label + ' failed', child.returncode if child.returncode > 0 else 128 - child.returncode)
        except ERRORS as error:
            problem = error
        finally:
            try:
                # Only this Popen-created group, never arbitrary discovered PIDs.
                leftovers = group_alive(child.pid)
                if leftovers:
                    try:
                        os.killpg(child.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    drain_until = min(deadline, time.monotonic() + cleanup)
                    try:
                        # Reap before probing: macOS can return EPERM for an unreaped exiting group.
                        child.wait(timeout=max(0, drain_until - time.monotonic()))
                    except subprocess.TimeoutExpired:
                        pass
                    while child.returncode is not None and group_alive(child.pid) and time.monotonic() < drain_until:
                        time.sleep(0.01)
                    if child.returncode is None or group_alive(child.pid):
                        try:
                            os.killpg(child.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    try:
                        child.wait(timeout=0.2)  # Bounded emergency drain; overrun stays non-pass.
                    except subprocess.TimeoutExpired:
                        raise GateFailure('owned cleanup unconfirmed; budget incomplete', 124)
                    if group_alive(child.pid):
                        raise GateFailure('owned group still present; budget incomplete', 124)
            except ERRORS as error:
                record['process_cleanup_error'] = str(error)
                if problem is None:
                    problem = error
    if problem is not None:
        raise problem
    if leftovers:
        raise GateFailure(label + ' left unexpected background work')
    if capture:
        require(path.stat().st_size <= 65536, label + ' metadata too large')
        return path.read_text().strip()

try:
    if args.tier in UNCONFIGURED:
        raise GateFailure(args.tier + ' tier is not configured for this repository', 2)
    require(not marker.exists(), 'previous incomplete run: preserve marker/logs and diagnose before a new attempt')
    cfg = json.loads(Path('.checks/config.json').read_text())
    require(isinstance(cfg, dict) and all(isinstance(cfg.get(key), dict) for key in
            ('targets', 'budgets_seconds', 'resources', 'story_checks')), 'missing/invalid configuration maps')
    require(isinstance(cfg['approval'], str) and cfg['approval'].strip(), 'missing planning approval reference')
    require(all(value in ('story', 'delivery') for value in cfg['targets'].values()), 'invalid target class')
    require(all(cfg['targets'].get(base) == 'delivery' for base in ('main', 'develop')), 'main/develop must be delivery targets')
    if args.merge:
        require(args.base in cfg['targets'] and args.head and re.fullmatch('[0-9a-f]{40}', args.head), 'missing/unknown base or head')
        tier = 'standard' if cfg['targets'][args.base] == 'story' else 'deep'
    else:
        require(not args.base and not args.head, 'base/head require merge mode')
        tier = args.tier
    trigger = 'merge:' + args.base if args.merge else {'quick': 'commit', 'standard': 'push'}.get(tier, 'manual:' + tier)
    approved_budget = cfg['budgets_seconds'][tier]
    budget = args.budget_seconds if args.budget_seconds is not None else approved_budget
    cleanup = cfg['cleanup_seconds']
    teardown = cfg['teardown_seconds']
    require(number(approved_budget) and number(budget) and number(cleanup) and number(teardown)
            and teardown + 2 * cleanup < budget, 'invalid budget/teardown/drain reserves')
    limits = cfg['resources']
    require(set(limits) == {'jobs', 'open_files'} and type(limits['jobs']) is int and 1 <= limits['jobs'] <= 4
            and type(limits['open_files']) is int and 32 <= limits['open_files'] <= 4096, 'invalid resource limits')
    ceiling = min(approved_budget, 1200) if tier == 'deep' else approved_budget
    preflight_budget = min(budget, ceiling)
    require(cleanup < preflight_budget, 'cleanup reserve exceeds approved preflight budget')
    deadline = started + preflight_budget  # Unapproved extensions cannot lengthen metadata setup.
    work_deadline = deadline - cleanup
    progress = {'started_at': time.time(), 'budget_seconds': preflight_budget, 'requested_budget_seconds': budget,
                'tier': tier, 'trigger': trigger, 'resources': limits, 'head': args.head, 'status': 'incomplete'}
    with marker.open('x') as output:
        json.dump(progress, output)
    record = progress  # Only the invocation that created the marker may update it.
    Path('.checks/.logs').mkdir(mode=0o700, exist_ok=True)
    logs = Path(tempfile.mkdtemp(dir='.checks/.logs', prefix='run-'))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    head = run(['git', 'rev-parse', 'HEAD'], 'head', True)
    work = ['setup'] + TIERS[tier]
    if args.merge:
        # Merge evidence must describe the head commit itself, not uncommitted edits on top of it.
        require(run(['git', 'status', '--porcelain', '--untracked-files=no'], 'status', True) == '',
                'tracked working tree changes; merge evidence must match the head commit')
        branch = run(['git', 'branch', '--show-current'], 'branch', True)
        extra = cfg['story_checks'][branch]  # Missing is blocked, not an assumed empty list.
        require(extra == [], 'invalid approved story checks')
        work += extra
    work += ['teardown']
    if args.exception or budget > ceiling:
        require(args.exception, 'explicit bounded exception required')
        exception = json.loads(Path(args.exception).read_text())
        require(number(exception['budget_seconds']) and exception['budget_seconds'] == budget
                and exception['scope'] == work and exception['trigger'] == trigger and exception['resources'] == limits
                and all(isinstance(exception[key], str) and exception[key].strip() for key in ('reason', 'approval')),
                'invalid exception scope/budget/trigger/resources/reason/approval reference')
    deadline = started + budget  # Same original start, including preflight; never a phase reset.
    work_deadline = deadline - teardown - 2 * cleanup
    record.update(head=head, scope=work, logs=str(logs), budget_seconds=budget)
    marker.write_text(json.dumps(record))
    if args.merge:
        actual = json.loads(run(['gh', 'pr', 'view', '--json', 'baseRefName,headRefOid,headRefName'], 'pr', True))
        require(actual['baseRefName'] == args.base and actual['headRefOid'] == args.head == head
                and actual['headRefName'] == branch, 'PR base/head/branch mismatch')
    print('Tier=' + tier + ' selected=' + ','.join(work) + ' budget=' + str(budget), flush=True)
    setup_attempted = False
    problem = None
    try:
        for name in work[:-1]:
            if name == 'setup':
                setup_attempted = True
            run(COMMANDS[name], name)
    except ERRORS as error:
        problem = error
    finally:
        if setup_attempted:
            try:
                run(COMMANDS['teardown'], 'teardown', cleaning=True)
                record['teardown'] = 'passed'
            except ERRORS as error:
                record['teardown'] = 'incomplete: ' + str(error)
                if problem is None:
                    problem = error
    if problem is not None:
        raise problem
    if interruption:
        raise GateFailure('interrupted', 130)
    require(time.monotonic() <= deadline, 'total budget exceeded including cleanup')
    marker.unlink()
    print('PASS tier=' + tier + ' total_seconds=' + str(round(time.monotonic() - started, 3)))
    for line in notices():
        print(line)
    print('Not selected by this trigger: ' + ','.join(name for name in COMMANDS if name not in work)
          + '; paid/prod not configured')
except ERRORS as error:
    if record is not None:
        record.update(error=str(error), elapsed_seconds=round(time.monotonic() - started, 3))
        marker.write_text(json.dumps(record))
    if record is not None and 'logs' in globals():
        for line in notices():
            print(line, file=sys.stderr)
    print('INCOMPLETE: ' + str(error) + '; teardown=' + str(record.get('teardown', 'not started') if record else 'not started')
          + '; total_seconds=' + str(round(time.monotonic() - started, 3)), file=sys.stderr)
    sys.exit(error.code if isinstance(error, GateFailure) else 2)
PY
