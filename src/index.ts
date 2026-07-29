import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { D1Database } from '@cloudflare/workers-types'
import type { R2Bucket } from '@cloudflare/workers-types'

type Env = {
  DB: D1Database
  ASSETS: any
  UPLOADS: R2Bucket
}
type Variables = {
  'consent-token': string
}

const app = new Hono<{ Bindings: Env, Variables: Variables }>()
app.use('/*')

app.get('/api/cops', async (c) => { ///should probably sort out the as rate_id thing and if theres any reason for it lol
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        c.id, c.first, c.last, c.rank, c.dept, c.badge, c.sal,
        r.id as rate_id, r.time, r.loc, r.txt, r.op, r.cops,
        rc.esc, rc.desc
      FROM cop c
      LEFT JOIN ratecop rc ON c.id = rc.cop_id
      LEFT JOIN rate r ON rc.rate_id = r.id AND r.status IN (0, 1)
    `).all()
    const copDict: Record<number, any> = {}
    result.results.forEach((row: any) => {
      if (!copDict[row.id]) {
        copDict[row.id] = {
          id: row.id,
          first: row.first,
          last: row.last,
          rank: row.rank,
          dept: row.dept,
          badge: row.badge,
          sal: row.sal,
          ratings: []
        }
      }
      if (row.rate_id) {
        copDict[row.id].ratings.push({
          id: row.rate_id,
          time: row.time,
          loc: row.loc,
          txt: row.txt,
          esc: row.esc,
          de_esc: row.desc,
          tags: row.op,
        })
      }
    })
    return c.json(Object.values(copDict))
  } catch (error) {
    console.error('Error fetching cops:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.get('/static/uploads/:uploadId/:filename', async (c) => {
  const uploadId = c.req.param('uploadId')
  const filename = c.req.param('filename')
  const key = `${uploadId}/${filename}`
  try {
    const object = await c.env.UPLOADS.get(key)
    if (!object) {
      return c.text('File not found', 404)
    }
    const ext = filename.split('.').pop()?.toLowerCase()
    let contentType = 'application/octet-stream'
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) {
      contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
    } else if (['mp3', 'wav'].includes(ext || '')) {
      contentType = `audio/${ext}`
    } else if (['mp4', 'avi', 'mov', 'webm', 'mkv'].includes(ext || '')) {
      contentType = `video/${ext}`
    }
    return new Response(object.body as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
      }
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return c.text('Error serving file', 500)
  }
})
// admin route secured using Cloudflare ZeroTrust, if running without Cloudflare use alternative means of securing route
app.get('/admin', async (c) => {
  // This route should be protected by Cloudflare Zero Trust
  try {
    const pendingPosts = await c.env.DB.prepare(`
      SELECT id, time, loc, txt, status
      FROM rate 
      WHERE status = 1
      ORDER BY time desc 
    `).all()
    
    const flaggedPosts = await c.env.DB.prepare(`
      SELECT id, time, loc, txt, status
      FROM rate 
      WHERE status = 2
      ORDER BY time desc
    `).all()
    
    const adminHtml = await c.env.ASSETS.fetch(new Request(c.req.url.replace('/admin', '/static/admin.html')))
    const text = await adminHtml.text()
    
    // Inject the data into the template
    const modifiedText = text
      .replace('__PENDING_POSTS__', JSON.stringify(pendingPosts.results))
      .replace('__FLAGGED_POSTS__', JSON.stringify(flaggedPosts.results))
    
    return c.html(modifiedText)
  } catch (error) {
    console.error('Error loading admin:', error)
    return c.text('Error loading admin panel', 500)
  }
})

app.post('/admin/approve/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare(`
      UPDATE rate SET status = 0 WHERE id = ?
    `).bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('Error approving post:', error)
    return c.json({ error: 'Failed to approve post' }, 500)
  }
})

app.post('/admin/delete/:id', async (c) => {
  const id = c.req.param('id')
  try {
    // Get the rate to check for files
    const rate = await c.env.DB.prepare(`
      SELECT op, files FROM rate WHERE id = ?
    `).bind(id).first()
    
    // Delete files from R2 if they exist
    if (rate?.op && rate?.files) {
      const fileNames = rate.files.split(', ')
      for (const fileName of fileNames) {
        const key = `${rate.op}/${fileName}`
        await c.env.UPLOADS.delete(key)
      }
    }
    
    await c.env.DB.prepare(`
      DELETE FROM ratecop WHERE rate_id = ?
    `).bind(id).run()
    
    // Delete the rate
    await c.env.DB.prepare(`
      DELETE FROM rate WHERE id = ?
    `).bind(id).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting post:', error)
    return c.json({ error: 'Failed to delete post' }, 500)
  }
})

app.post('/api/flag/:id', async (c) => {
  const id = c.req.param('id')
  const consentToken = c.req.header('cookie')?.split(';')
    .find((cookie: string) => cookie.trim().startsWith('consent-token='))
    ?.split('=')[1]
  
  if (!consentToken || !isValidConsentToken(consentToken)) {
    return c.json({ error: 'Invalid consent token' }, 403)
  }
  
  try {
    const rate = await c.env.DB.prepare(`
      SELECT id FROM rate WHERE id = ? AND status IN (0, 1)
    `).bind(id).first()
    
    if (!rate) {
      return c.json({ error: 'Rate not found' }, 404)
    }
      await c.env.DB.prepare(`
      UPDATE rate SET status = 2 WHERE id = ?
    `).bind(id).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error flagging post:', error)
    return c.json({ error: 'Failed to flag post' }, 500)
  }
})

app.post('/admin/unflag/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare(`
      UPDATE rate SET status = 0 WHERE id = ?
    `).bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('Error unflagging post:', error)
    return c.json({ error: 'Failed to unflag post' }, 500)
  }
})

app.post('/ratecops', async (c) => {
  const formData = await c.req.formData()
  try {
    const time = formData.get('time')
    const loc = formData.get('loc')
    const txt = formData.get('txt')
   // const files = formData.getAll('files')
    const copId = c.req.query('cop')
    const copsData: string[] = []
    const ratecopEntries: Array<{cop_id: number, esc: boolean, de_esc: boolean}> = []
    if (copId) {
      const copResult = await c.env.DB.prepare(`
        SELECT id, first, last, rank, dept, badge FROM cop WHERE id = ?
      `).bind(copId).first()      
      if (copResult) {
        const esc = formData.get('cops-0-esc') === 'y'
        const de_esc = formData.get('cops-0-de_esc') === 'y'
        const copDetails = `${copResult.first} ${copResult.last}`.trim()
        const copsString = `${copResult.id}:${copDetails}${copResult.rank ? ` - ${copResult.rank}` : ''}${copResult.dept ? ` - ${copResult.dept}` : ''}${copResult.badge ? ` (#${copResult.badge})` : ''}`
        copsData.push(copsString)
        ratecopEntries.push({
          cop_id: copResult.id as number,
          esc,
          de_esc
        })
      }
    }
    const uploadId = crypto.randomUUID()
    const formEntries: Array<[string, FormDataEntryValue]> = []
    for (const [key, value] of formData as any) {
      formEntries.push([key, value])
    }
    const copGroups = new Map<number, any>()
    formEntries.forEach(([key, value]: [string, FormDataEntryValue]) => {
      const match = key.match(/^cops-(\d+)-(.+)$/)
      if (match) {
        const index = parseInt(match[1])
        const field = match[2]
        if (copId && index === 0) return
        if (!copGroups.has(index)) {
          copGroups.set(index, {})
        }
        copGroups.get(index)[field] = value
      }
    })
    for (const [index, copData] of copGroups) {
      const first = (copData.first as string || '').trim() || 'Unknown'
      const last = (copData.last as string || '').trim() || 'Unknown'
      const badge = (copData.badge as string || '').trim() || 'Unknown'
      const rank = (copData.rank as string || '').trim() || 'Unknown'
      const dept = (copData.dept as string || '').trim() || 'Unknown'
      const esc = copData.esc === 'y'
      const de_esc = copData.de_esc === 'y'
      if (first !== 'Unknown' || last !== 'Unknown') {
        // Check if cop already exists
        let copResult = await c.env.DB.prepare(`
          SELECT id, first, last, rank, dept, badge FROM cop 
          WHERE first = ? AND last = ? AND dept = ?
        `).bind(first, last, dept).first()
        if (!copResult) {
          const newCopResult = await c.env.DB.prepare(`
            INSERT INTO cop (first, last, dept, rank, badge)
            VALUES (?, ?, ?, ?, ?)
          `).bind(first, last, dept, rank, badge).run()
          copResult = {
            id: newCopResult.meta.last_row_id,
            first,
            last,
            rank,
            dept,
            badge
          }
        }
        let copDetails = `${first} ${last}`.trim()
        if (rank && rank !== 'Unknown') {
          copDetails += ` - ${rank}`
        }
        if (badge && badge !== 'Unknown') {
          copDetails += ` (#${badge})`
        }
        if (dept && dept !== 'Unknown') {
          copDetails += ` - ${dept}`
        }
        copsData.push(`${copResult.id}:${copDetails}`)
        ratecopEntries.push({
          cop_id: copResult.id as number,
          esc,
          de_esc
        })
      }
    }
    if (copsData.length === 0) {
      return c.text('No valid cop data provided', 400)
    }
    const result = await c.env.DB.prepare(`
      INSERT INTO rate (time, loc, txt, cops, tags, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      time,
      loc,
      txt,
      copsData.join(', '),
      'tag',
      1  // Default status: 1 = pending
    ).run()
    for (const entry of ratecopEntries) {
      await c.env.DB.prepare(`
        INSERT INTO ratecop (rate_id, cop_id, esc, de_esc)
        VALUES (?, ?, ?, ?)
      `).bind(
        result.meta.last_row_id,
        entry.cop_id,
        entry.esc,
        entry.de_esc
      ).run()
    }
    return c.redirect(`/rate/${result.meta.last_row_id}`)
  } catch (error) {
    console.error('Error submitting rating:', error)
    return c.text('Error submitting rating', 500)
  }
})
//GET RID OF STATIC HANDLER, logo, favicon, script imports
app.get('/static/*', async (c) => {
 try {
    const asset = await c.env.ASSETS.fetch(c.req)
    return asset
} catch (e) {
   return c.text('Static asset not found', 404)
  }
})

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  try {
    if (url.pathname === '/') {
      const home = new Request(new URL('/static/home.html', c.req.url)) 
      return await c.env.ASSETS.fetch(home)
    }
    if (url.pathname === '/map') {
      const map = new Request(new URL('/static/map.html', c.req.url))
      return await c.env.ASSETS.fetch(map)
    }  
    if (url.pathname === '/cop-co') {
      const map = new Request(new URL('/static/cop-co-ssd.html', c.req.url))
      return await c.env.ASSETS.fetch(map)
    }  
      return await c.env.ASSETS.fetch(c.req)
  } catch (e) {
    return c.text('Not Found', 404)
  }
})

export default app
