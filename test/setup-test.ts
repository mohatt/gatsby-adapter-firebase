import { fs } from 'memfs'

// Register vitest-memfs matchers
import 'vitest-memfs/setup'

// Use virtual file system for testing
vi.mock('fs', () => ({ default: fs }))
vi.mock('fs/promises', () => ({ default: fs.promises }))
