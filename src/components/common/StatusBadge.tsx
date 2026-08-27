import React from 'react'

interface StatusBadgeProps {
  status: boolean | string
  activeLabel?: string
  inactiveLabel?: string
  size?: 'sm' | 'md'
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  activeLabel = 'Active',
  inactiveLabel = 'Inactive',
  size = 'md'
}) => {
  const isActive = status === true || status === 'active' || status === 'present'
  const isPending = status === 'pending' || status === 'verifying'

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs'
  }

  if (isPending) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200 ${sizeClasses[size]}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        {typeof status === 'string' ? status.toUpperCase() : 'PENDING'}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${
        isActive
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-slate-100 text-slate-600 border border-slate-200'
      } ${sizeClasses[size]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}
      />
      {isActive ? activeLabel : inactiveLabel}
    </span>
  )
}

