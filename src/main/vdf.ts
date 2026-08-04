/**
 * Minimal parser for Valve's VDF/KeyValues format.
 *
 * Covers the subset used by `libraryfolders.vdf`: quoted keys and values,
 * brace blocks, and `//` comments. We need no macros, conditionals
 * (`[$WIN32]`) or includes.
 */

export type VdfNode = { [key: string]: string | VdfNode }

type Token = { type: 'string'; value: string } | { type: 'open' | 'close' }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++
      continue
    }

    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }

    if (ch === '{') {
      tokens.push({ type: 'open' })
      i++
      continue
    }

    if (ch === '}') {
      tokens.push({ type: 'close' })
      i++
      continue
    }

    if (ch === '"') {
      i++
      let value = ''
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          // Valve escapes backslashes in paths: "C:\\Program Files".
          const next = text[i + 1]
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          i += 2
          continue
        }
        value += text[i]
        i++
      }
      i++ // closing quote
      tokens.push({ type: 'string', value })
      continue
    }

    // Unquoted token (rare, but it happens): runs to the next whitespace.
    let value = ''
    while (i < text.length && !' \t\r\n{}'.includes(text[i])) {
      value += text[i]
      i++
    }
    tokens.push({ type: 'string', value })
  }

  return tokens
}

export function parseVdf(text: string): VdfNode {
  const tokens = tokenize(text)
  let i = 0

  function parseBlock(): VdfNode {
    const node: VdfNode = {}

    while (i < tokens.length) {
      const token = tokens[i]

      if (token.type === 'close') {
        i++
        return node
      }

      if (token.type !== 'string') {
        i++
        continue
      }

      const key = token.value
      i++

      const next = tokens[i]
      if (!next) break

      if (next.type === 'open') {
        i++
        node[key] = parseBlock()
      } else if (next.type === 'string') {
        node[key] = next.value
        i++
      } else {
        i++
      }
    }

    return node
  }

  return parseBlock()
}
