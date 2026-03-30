import { useState } from "react"

type SearchBarProps = {
  readonly onSearch: (query: string) => void
  readonly placeholder?: string
}

function SearchBar({ onSearch, placeholder = "Search company ticker..." }: SearchBarProps) {
  const [query, setQuery] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim().toUpperCase())
      setQuery("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg px-3 py-2 text-sm flex-1 outline-none transition-all focus:ring-1"
        style={{
          background: "rgba(22, 27, 34, 0.9)",
          border: "1px solid rgba(0, 240, 255, 0.15)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      />
      <button
        type="submit"
        className="rounded-lg px-4 py-2 text-sm font-medium transition-all hover:brightness-110"
        style={{
          background: "rgba(0, 240, 255, 0.15)",
          border: "1px solid rgba(0, 240, 255, 0.3)",
          color: "var(--color-neon-cyan)",
          fontFamily: "var(--font-body)",
        }}
      >
        Add
      </button>
    </form>
  )
}

export { SearchBar }
