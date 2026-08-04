import { describe, expect, it } from 'vitest'
import { parseVdf } from './vdf'

// A faithful slice of a real libraryfolders.vdf, with backslashes escaped the
// way Valve writes them and a library on another drive.
const LIBRARY_FOLDERS = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
		"contentid"		"6934102118912142863"
		"apps"
		{
			"570"		"75753621054"
			"228980"		"147871673"
		}
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
		"label"		""
		"apps"
		{
		}
	}
}`

describe('parseVdf', () => {
  it('extracts library paths and unescapes the backslashes', () => {
    const parsed = parseVdf(LIBRARY_FOLDERS)
    const root = parsed['libraryfolders'] as Record<string, Record<string, string>>

    expect(root['0']['path']).toBe('C:\\Program Files (x86)\\Steam')
    expect(root['1']['path']).toBe('D:\\SteamLibrary')
  })

  it('handles nested and empty blocks', () => {
    const parsed = parseVdf(LIBRARY_FOLDERS)
    const root = parsed['libraryfolders'] as Record<string, Record<string, unknown>>

    expect(root['0']['apps']).toEqual({ '570': '75753621054', '228980': '147871673' })
    expect(root['1']['apps']).toEqual({})
    expect(root['0']['label']).toBe('')
  })

  it('ignores comments', () => {
    const parsed = parseVdf(`
      // this is a comment
      "root"
      {
        "a" "1" // another comment
        "b" "2"
      }
    `)
    expect(parsed['root']).toEqual({ a: '1', b: '2' })
  })

  it('does not break on malformed input', () => {
    expect(() => parseVdf('"key" "value" "orphan"')).not.toThrow()
    expect(() => parseVdf('{{{')).not.toThrow()
    expect(() => parseVdf('"unclosed quote')).not.toThrow()
    expect(parseVdf('')).toEqual({})
  })
})
