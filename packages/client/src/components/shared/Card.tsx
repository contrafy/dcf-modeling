import type { ReactNode } from "react"

type CardProps = {
  readonly children: ReactNode
  readonly className?: string
  readonly glowColor?: string
}

function Card({ children, className = "", glowColor = "var(--color-neon-cyan)" }: CardProps) {
  return (
    <div
      className={`rounded-lg p-4 backdrop-blur-md ${className}`}
      style={{
        background: "rgba(22, 27, 34, 0.8)",
        border: `1px solid ${glowColor}25`,
        boxShadow: `0 0 15px ${glowColor}10, inset 0 0 15px ${glowColor}05`,
      }}
    >
      {children}
    </div>
  )
}

export { Card }
