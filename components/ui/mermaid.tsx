'use client'

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

type MermaidProps = {
  chart: string
}

let renderId = 0

/**
 * Comprehensive AI-generated Mermaid syntax sanitizer.
 * Fixes every known LLM Mermaid mistake before rendering.
 */
function sanitizeMermaid(raw: string): string {
  let chart = raw

  // 1. Fix double-escaped or triple-escaped newlines first: \\n or \\\\n → real newline
  chart = chart.replace(/\\\\n/g, '\n')
  chart = chart.replace(/\\n/g, '\n')

  // 2. Fix incorrect edge label syntax: A--True-->B → A-->|True|B
  //    Also handles: A -- True --> B, A --Yes--> B
  chart = chart.replace(/\s*--\s*([A-Za-z0-9_ ]+?)\s*-->\s*/g, ' -->|$1| ')

  // 3. If single line with semicolons, split on semicolons → multi-line
  if (!chart.includes('\n') && chart.includes(';')) {
    chart = chart.replace(/;\s*/g, '\n')
  }

  // 4. Fix lowercase "end" as node ID (reserved keyword) → "End"
  chart = chart.replace(/\bend\b(?!\s*[;\n])/g, 'End')

  // 5. Fix parenthesis node syntax: A(Some label) → A[Some label]
  //    Mermaid's (...) creates rounded nodes but is fragile with special chars.
  //    Convert to square bracket syntax which is more robust.
  chart = chart.replace(/^(\s*\w+)\(([^)]+)\)/gm, '$1[$2]')

  // 6. Remove colons inside labels — they break Mermaid parser
  //    But preserve the label content otherwise
  chart = chart.replace(/\[([^\]]*:[^\]]*)\]/g, (_, content) => {
    return `[${content.replace(/:/g, ' -')}]`
  })

  chart = chart.replace(/\[([^\]]*)\]/g, (_, content: string) => {
    const safe = content.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;')
    return `[${safe}]`
  })
  chart = chart.replace(/\{([^}]*)\}/g, (_, content: string) => {
    // Skip if it looks like subgraph syntax
    if (content.trim() === '') return `{${content}}`
    const safe = content.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;')
    return `{${safe}}`
  })

  // 8. Remove nested double quotes inside [...] and {...} labels
  chart = chart.replace(/\["(.*?)"\]/g, (_, content) => {
    const cleaned = content.replace(/"/g, "'")
    return `["${cleaned}"]`
  })
  chart = chart.replace(/\{"(.*?)"\}/g, (_, content) => {
    const cleaned = content.replace(/"/g, "'")
    return `{"${cleaned}"}`
  })

  // 9. Fix escaped quotes inside labels: \"text\" → text
  chart = chart.replace(/\\"/g, "'")

  // 10. Fix node IDs with reserved prefix after ---
  chart = chart.replace(/---([ox])([A-Z])/g, '--- $1$2')

  return chart.trim()
}

export function Mermaid({ chart }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false

    const renderChart = async () => {
      if (!containerRef.current) return

      const trimmedChart = chart.trim()

      // Treat empty, "null", "undefined" as no diagram
      if (!trimmedChart || trimmedChart === 'null' || trimmedChart === 'undefined') {
        if (!cancelled) setStatus('failed')
        return
      }

      const sanitized = sanitizeMermaid(trimmedChart)

      try {
        if (!cancelled) setStatus('loading')

        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: 'dark',
          themeVariables: {
            background: '#1a1a2e',
            mainBkg: '#1a1a2e',
            primaryColor: '#312e81',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#8b5cf6',
            lineColor: '#a78bfa',
            secondaryColor: '#111827',
            secondaryTextColor: '#e2e8f0',
            tertiaryColor: '#0f172a',
            tertiaryTextColor: '#e2e8f0',
            fontFamily: 'Inter, sans-serif',
          },
        })

        const id = `mermaid-chart-${renderId++}`
        const { svg } = await mermaid.render(id, sanitized)

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setStatus('success')
        }
      } catch {
        if (!cancelled) {
          setStatus('failed')
          if (containerRef.current) {
            containerRef.current.innerHTML = ''
          }
        }
      }
    }

    renderChart()

    return () => {
      cancelled = true
    }
  }, [chart])

  // If render failed — completely invisible, no wrapper, no space
  if (status === 'failed') {
    return null
  }

  return <div ref={containerRef} />
}
