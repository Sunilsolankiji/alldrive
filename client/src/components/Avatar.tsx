import { useState } from 'react'

interface Props {
  src?: string
  email: string
  className: string
}

/** Google account photo; falls back to the email's initial if missing or blocked. */
const Avatar = ({ src, email, className }: Props) => {
  const [failed, setFailed] = useState(false)
  if (src && !failed)
    return (
      <img
        src={src}
        alt=""
        // Google's photo CDN rejects requests carrying a localhost/app referrer
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    )
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600 ${className}`}
    >
      {email.charAt(0).toUpperCase()}
    </span>
  )
}

export default Avatar
