import type { ReactElement, ReactNode } from 'react';
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay, Popover } from 'react-aria-components';
import { Button } from './controls.js';

export function ViewerDialog({ trigger, title, children, footer, size = 'image' }: { trigger: ReactElement; title: string; children: ReactNode; footer?: ReactNode; size?: 'image' | 'sheet' | 'board' }) {
  return <DialogTrigger>{trigger}<ModalOverlay className="wp-modal-overlay" isDismissable><Modal className={`wp-modal${size === 'sheet' ? ' wp-modal-sheet' : size === 'board' ? ' wp-modal-board' : ''}`}><Dialog className="wp-dialog">{({ close }) => <><div className="wp-dialog-head"><Heading slot="title">{title}</Heading><Button variant="icon" aria-label="Close" autoFocus onPress={close}>×</Button></div>{children}{footer && <div className="wp-dialog-foot">{footer}</div>}</>}</Dialog></Modal></ModalOverlay></DialogTrigger>;
}
// Uses the approved single-select menu surface, not a new banner/card family.
export function DetailsPopover({ trigger, title, children }: { trigger: ReactElement; title: string; children: ReactNode }) {
  return <DialogTrigger>{trigger}<Popover className="wp-popover" offset={4}><Dialog aria-label={title} className="wp-popover-content">{children}</Dialog></Popover></DialogTrigger>;
}
