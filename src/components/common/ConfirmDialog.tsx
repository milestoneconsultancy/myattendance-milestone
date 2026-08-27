import React from 'react'
import { Modal } from './Modal'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
  isLoading?: boolean
  variant?: 'danger' | 'warning' | 'info'
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  isLoading = false,
  variant = isDestructive ? 'danger' : 'warning'
}) => {
  const icons = {
    danger: <AlertTriangle className="h-6 w-6 text-rose-600" />,
    warning: <AlertCircle className="h-6 w-6 text-amber-600" />,
    info: <Info className="h-6 w-6 text-sky-600" />
  }

  const iconBgs = {
    danger: 'bg-rose-50 border-rose-100',
    warning: 'bg-amber-50 border-amber-100',
    info: 'bg-sky-50 border-sky-100'
  }

  const buttonColors = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
    info: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20'
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3.5">
          <div className={`shrink-0 rounded-xl border p-2.5 ${iconBgs[variant]}`}>
            {icons[variant]}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed pt-1">{message}</p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer ${buttonColors[variant]}`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

