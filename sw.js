/* *** EL SERVICE WORKER DE CESTA. ***
 *
 *  *Lo que hace: que la app **abra sin red**. Nada mas -- y nada menos.*
 *
 *  *** LAS TRES DECISIONES, y por que cada una. ***
 *
 *  1. **QUE se cachea: el armazon.** *El `index.html`, los trozos del build (`/assets/*`), los iconos
 *     y el manifiesto.* *Son ficheros que cambian cuando se publica y no antes, asi que una copia
 *     guardada no miente.*
 *
 *  2. **QUE NO se cachea: la API.** *`/api/**` va **siempre a la red**.* *Los precios y las listas
 *     caducan; una respuesta guardada enseñaria el precio de ayer como si fuera el de hoy, y eso es
 *     exactamente lo que esta aplicacion lleva toda su vida evitando.* *Sin red, la API falla -- y la
 *     pantalla ya sabe decir que no hay conexion.*
 *
 *  3. **COMO se versiona.** *El nombre de la cache lleva la version del build (`VERSION`), que se
 *     escribe al construir.* *Al activarse, **borra las caches que no son la suya**: asi no se queda
 *     el armazon viejo sirviendo para siempre.* *Y no se hace `skipWaiting` a la fuerza: una version
 *     nueva espera a que se cierren las pestanas, para no cambiar la app bajo los pies de quien esta
 *     en el pasillo.*
 *
 *  *Lo que NO hace: no intercepta escrituras, no encola nada y no duplica la cola de cambios de la
 *  lista.* *Esa cola ya existe en la aplicacion (`networkMode: 'always'`) y es la que sabe reenviar lo
 *  que se tacho sin cobertura.*
 */

const VERSION = '__VERSION__';
const CACHE = 'cesta-' + VERSION;

/* *Lo minimo para que la app abra: el documento, el manifiesto y los iconos.* *Los trozos del build se
 * guardan solos la primera vez que se piden (ver `fetch`).*
 */
const ARMAZON = ['/', '/site.webmanifest', '/icono.svg', '/icono-192.png'];

/** *** LOS TROZOS DE LA ENTRADA, ESCRITOS AQUI AL CONSTRUIR. ***
 *
 *  *Esto lo rellena `scripts/sella-sw.mjs` leyendo el `index.html` del build: son el `<script>` y los
 *  `<link rel="modulepreload">` -- **exactamente lo que hace falta para que la primera pantalla se
 *  pinte**.*
 *
 *  *** Por que no basta con cachearlos «cuando se piden». *** *Se probo asi y no se sostiene: un trozo
 *  solo acaba en la cache si paso por ahi **despues** de que el service worker estuviera controlando.*
 *  *Medido: 3 trozos una vez, 1 otra, 0 otra -- y con 1 la app abria con el marco y sin contenido
 *  (`53` caracteres).* *Una cache que acierta a veces no es offline.*
 */
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (evento) => {
  // *** UNA A UNA, Y NO `addAll`. ***
  // *`addAll` es **atomico**: si una sola de las URLs falla -- un 404, un cambio de nombre, un
  // servidor que no contesta a tiempo -- **no se guarda ninguna**, y el armazon se queda sin cache sin
  // que nadie se entere.* *Lo encontro la prueba: el SW quedaba «registrado» y `caches.keys()` volvia
  // vacio.*
  // *Guardando una a una, lo que se pueda guardar se guarda, y lo que no se queda para la proxima
  // carga.*
  evento.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(
      // *Una a una: `addAll` es atomico y una sola URL caida dejaba la cache vacia.*
      // *Y **los trozos de la entrada no se tragan el fallo**: sin ellos no hay primera pantalla, y
      // un service worker que dice estar instalado sin poder pintar es peor que no tenerlo.*
      [
        ...ARMAZON.map((url) => c.add(url)),
        ...PRECACHE.map((url) => c.add(url)),
      ].map((p) => p.catch(() => undefined)),
    )).then(() => caches.open(CACHE)).then(async (c) => {
      // *Y se comprueba: si los trozos de la entrada no han entrado, esta instalacion no vale.*
      const faltan = [];
      for (const url of PRECACHE) {
        if (!(await c.match(url))) faltan.push(url);
      }
      if (faltan.length) {
        throw new Error('precache incompleto: faltan ' + faltan.join(', '));
      }
    }),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** *¿Es un fichero del build, que no cambia hasta la proxima publicacion?*
 *
 *  *Los de `/assets` llevan hash en el nombre, asi que un cambio de contenido es un cambio de URL.*
 */
function esDelBuild(url) {
  return url.pathname.startsWith('/assets/') || /\.(png|svg|woff2|css)$/.test(url.pathname);
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // *** LA API NUNCA SE CACHEA. *** *Un precio guardado es un precio que miente.*
  if (url.pathname.startsWith('/api/')) return;

  // *Navegacion: se sirve el armazon guardado y, si no esta, se pide.*
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion).catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  if (esDelBuild(url)) {
    // *Del build: primero la copia (es inmutable) y, si no esta, la red -- y se guarda.*
    evento.respondWith(
      caches.match(peticion).then((guardada) => guardada || fetch(peticion).then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(peticion, copia)).catch(() => undefined);
        }
        return respuesta;
      })),
    );
  }
});
