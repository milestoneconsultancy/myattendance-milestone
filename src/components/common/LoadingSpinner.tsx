import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  fullScreen?: boolean
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message = 'Loading...',
  fullScreen = false
}) => {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  }

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size]} border-sky-600 border-t-transparent rounded-full animate-spin`}
      />
      {message && <p className="text-sm font-medium text-slate-600 animate-pulse">{message}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center">
          {spinner}
        </div>
      </div>
    )
  }

  return <div className="py-12 flex justify-center items-center">{spinner}</div>
}

