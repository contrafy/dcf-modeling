import type { ReactNode } from "react"

type ModalProps = {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly children: ReactNode
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }} />
      <div
        className="relative rounded-xl p-6 min-w-[400px] max-w-[600px]"
        style={{
          background: "rgba(13, 17, 23, 0.95)",
          border: "1px solid rgba(0, 240, 255, 0.2)",
          boxShadow: "0 0 30px rgba(0, 240, 255, 0.1), 0 0 60px rgba(0, 240, 255, 0.05)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-cyan)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-text-muted)" }}
          >
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export { Modal }
