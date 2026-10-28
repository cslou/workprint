import type { ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import type { TabsProps } from 'react-aria-components';

const workspaceTabs = [
  { id: 'script', label: 'Script', empty: 'Your script will appear here once you describe your video.' },
  { id: 'assets', label: 'Assets', empty: 'Characters, places and props will appear here.' },
  { id: 'storyboard', label: 'Storyboard', empty: 'The storyboard is planned once the script is agreed.' },
  { id: 'videos', label: 'Videos', empty: 'No videos yet.' },
] as const;
export type WorkspaceTab = typeof workspaceTabs[number]['id'];
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="wp-empty">{children}</div>;
}
export function WorkspacePanel({ content = {}, placeholder, updated = [], ...props }: Omit<TabsProps, 'children' | 'className' | 'orientation'> & { content?: Partial<Record<WorkspaceTab, ReactNode>>; placeholder?: ReactNode; updated?: readonly WorkspaceTab[] }) {
  return <Tabs {...props} className="wp-panel" defaultSelectedKey={props.defaultSelectedKey ?? 'script'}>
    <TabList aria-label="This video" className="wp-tabs">{workspaceTabs.map(({ id, label }) => <Tab className="wp-tab" id={id} key={id}>{label}{updated.includes(id) && <span className="wp-tab-update"><span className="wp-sr-only">, updated</span></span>}</Tab>)}</TabList>
    {workspaceTabs.map(({ id, empty }) => <TabPanel className="wp-panel-body" id={id} key={id}>{placeholder ?? content[id] ?? <EmptyState>{empty}</EmptyState>}</TabPanel>)}
  </Tabs>;
}
export function PanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="wp-panel-section"><div className="wp-panel-label"><span>{title}</span>{action}</div>{children}</section>;
}
