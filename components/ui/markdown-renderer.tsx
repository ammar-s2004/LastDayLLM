'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
// @ts-ignore
import remarkMath from 'remark-math'
// @ts-ignore
import remarkBreaks from 'remark-breaks'
// @ts-ignore
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div
      className="prose prose-invert max-w-none"
      style={{
        color: '#E2E8F0',
        fontSize: '15px',
        lineHeight: '1.6',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ node, ...props }) => <h1 style={{ color: '#F8FAFC', fontSize: '1.5em', fontWeight: 700, marginTop: '1.5em', marginBottom: '0.5em' }} {...props} />,
          h2: ({ node, ...props }) => <h2 style={{ color: '#F1F5F9', fontSize: '1.3em', fontWeight: 700, marginTop: '1.2em', marginBottom: '0.5em' }} {...props} />,
          h3: ({ node, ...props }) => <h3 style={{ color: '#E2E8F0', fontSize: '1.1em', fontWeight: 600, marginTop: '1.5em', marginBottom: '0.75em' }} {...props} />,
          p: ({ node, ...props }) => <p style={{ marginBottom: '1.25em' }} {...props} />,
          ul: ({ node, ...props }) => <ul style={{ listStyleType: 'disc', paddingLeft: '1.5em', marginBottom: '1.25em', display: 'flex', flexDirection: 'column', gap: '0.5em' }} {...props} />,
          ol: ({ node, ...props }) => <ol style={{ listStyleType: 'decimal', paddingLeft: '1.5em', marginBottom: '1.25em', display: 'flex', flexDirection: 'column', gap: '0.5em' }} {...props} />,
          li: ({ node, ...props }) => <li style={{ marginBottom: '0.25em', lineHeight: '1.7' }} {...props} />,
          a: ({ node, ...props }) => <a style={{ color: '#8B5CF6', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer" {...props} />,
          strong: ({ node, ...props }) => <strong style={{ color: '#FDE047', fontWeight: 600 }} {...props} />,
          em: ({ node, ...props }) => <em style={{ fontStyle: 'italic', color: '#CBD5E1' }} {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote
              style={{
                borderLeft: '4px solid #8B5CF6',
                paddingLeft: '1em',
                color: '#94A3B8',
                fontStyle: 'italic',
                margin: '1em 0',
                background: 'rgba(139, 92, 246, 0.05)',
                padding: '0.5em 1em',
                borderRadius: '0 8px 8px 0',
              }}
              {...props}
            />
          ),
          pre: ({ node, ...props }) => (
            <pre
              style={{
                background: '#0F172A',
                padding: '1em',
                borderRadius: '8px',
                overflowX: 'auto',
                border: '1px solid rgba(255,255,255,0.1)',
                marginBottom: '1em',
              }}
              {...props}
            />
          ),
          code: ({ node, inline, ...props }: any) => {
            if (inline) {
              return (
                <code
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    padding: '0.2em 0.4em',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                    color: '#C4B5FD',
                  }}
                  {...props}
                />
              )
            }
            return <code style={{ fontFamily: 'monospace', fontSize: '0.9em', color: '#E2E8F0' }} {...props} />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
