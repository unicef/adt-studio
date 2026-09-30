import betaLogoUrl from "../assets/logo-beta.png"
import stableLogoUrl from "../assets/logo.png"

const CHANNEL_LOGO = {
  stable: {
    src: stableLogoUrl,
    glow:
      "radial-gradient(closest-side, rgba(59,130,246,0.45), rgba(59,130,246,0) 70%)",
    filter:
      "drop-shadow(0 18px 36px rgba(43,127,255,0.32)) drop-shadow(0 2px 6px rgba(15,23,42,0.12))",
  },
  beta: {
    src: betaLogoUrl,
    glow:
      "radial-gradient(closest-side, rgba(148,52,232,0.45), rgba(148,52,232,0) 70%)",
    filter:
      "drop-shadow(0 18px 36px rgba(148,52,232,0.32)) drop-shadow(0 2px 6px rgba(15,23,42,0.12))",
  },
} as const

function SplashLogo() {
  const isBeta = (window.splashControls?.version ?? "").includes("-beta")
  const logo = CHANNEL_LOGO[isBeta ? "beta" : "stable"]

  return (
    <div className="relative flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-[36%] blur-2xl"
        style={{
          background: logo.glow,
          transform: "scale(1.35)",
        }}
      />
      <img
        src={logo.src}
        alt=""
        width={120}
        height={120}
        className="animate-[splash-icon-float_4.5s_ease-in-out_infinite]"
        style={{ filter: logo.filter }}
      />
    </div>
  )
}

export { SplashLogo }
