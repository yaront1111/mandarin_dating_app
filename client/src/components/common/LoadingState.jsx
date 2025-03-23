const Spinner = ({ size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  }

  return (
    <div
      className={`animate-spin rounded-full border-t-2 border-b-2 border-primary ${sizeClasses[size]} ${className}`}
    ></div>
  )
}

export const LoadingState = ({
  text = "Loading...",
  size = "md",
  fullScreen = false,
  overlay = false,
  transparent = false,
}) => {
  if (fullScreen) {
    return (
      <div
        className={`fixed inset-0 flex flex-col items-center justify-center z-50 ${overlay ? "bg-black bg-opacity-50" : transparent ? "bg-transparent" : "bg-white"}`}
      >
        <Spinner size={size} className="mb-4" />
        {text && <p className={`text-sm font-medium ${overlay ? "text-white" : "text-gray-600"}`}>{text}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <Spinner size={size} className="mb-4" />
      {text && <p className="text-sm font-medium text-gray-600">{text}</p>}
    </div>
  )
}

export const LoadingButton = ({ loading, children, disabled, className = "", spinnerSize = "sm", ...props }) => {
  return (
    <button disabled={loading || disabled} className={`relative ${className}`} {...props}>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={spinnerSize} />
        </span>
      )}
      <span className={loading ? "invisible" : ""}>{children}</span>
    </button>
  )
}

export default LoadingState
