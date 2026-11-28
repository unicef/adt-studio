import { useState } from "react"
import { githubAvatarUrl } from "./beta-version-utils"

function ContributorAvatar({ login }: { login: string }) {
  const [failed, setFailed] = useState(false)
  const src = githubAvatarUrl(login)

  return (
    <span
      title={`@${login}`}
      className="relative grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold uppercase text-muted-foreground ring-2 ring-card"
    >
      {login.charAt(0)}
      {src && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  )
}

export function ContributorAvatars({ logins, max = 3 }: { logins: readonly string[]; max?: number }) {
  const hidden = logins.length - max

  return (
    <span className="flex items-center -space-x-1.5">
      {logins.slice(0, max).map((login) => (
        <ContributorAvatar key={login} login={login} />
      ))}
      {hidden > 0 && (
        <span className="grid h-5 shrink-0 place-items-center rounded-full bg-muted px-1.5 font-mono text-[9px] font-semibold text-muted-foreground ring-2 ring-card">
          +{hidden}
        </span>
      )}
    </span>
  )
}
