/** *** EL SERVICE WORKER DE LA DEMO: ABIERTA SIN RED. *** *
 *
 *  *La demo es estática. Este trabajador cachea la propia página y lo que se va pidiendo
 *  (JS, CSS, fuentes, imágenes) para que la lista y el catálogo ya cargados sigan abriéndose
 *  en el ascensor o en el súper sin cobertura.*
 *
 *  *Cache-first y, si no está, red. Si la red tampoco está y es una navegación, se sirve el
 *  armazón para que la app arranque con lo que tiene en IndexedDB.*
 *
 *  *Este fichero es solo de la demo (`build:demo`); la app de casa usa `sw.js`.*
 */
const CACHE = 'avio-demo-v1'
const BASE = new URL(self.registration.scope).pathname

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([BASE, `${BASE}index.html`, `${BASE}site.webmanifest`]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  const url = new URL(peticion.url)
  if (peticion.method !== 'GET' || url.origin !== self.location.origin) return

  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone()
          void caches.open(CACHE).then((cache) => cache.put(peticion, copia))
          return respuesta
        })
        .catch(() => caches.match(`${BASE}index.html`).then((hit) => hit || caches.match(BASE))),
    )
    return
  }

  evento.respondWith(
    caches.match(peticion).then((hit) => {
      if (hit) return hit
      return fetch(peticion).then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone()
          void caches.open(CACHE).then((cache) => cache.put(peticion, copia))
        }
        return respuesta
      })
    }),
  )
})
