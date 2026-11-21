'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  MapPin,
  PlusCircle,
  Search,
  Send,
  ShieldCheck,
  Store,
  Tag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PrecioItem {
  id_precio: number;
  producto: string;
  categoria: string;
  unidad_medida: string;
  comercio: string;
  direccion: string;
  precio_normal: number;
  precio_oferta: number | null;
  precio_efectivo: number;
  distancia_metros: number;
  latitud: number;
  longitud: number;
}

interface ProductoOption {
  id_producto: number;
  nombre_homologado: string;
  unidad_medida: string;
}

interface SucursalOption {
  id_sucursal: number;
  direccion: string;
  comercio: { nombre_razon_social: string } | { nombre_razon_social: string }[] | null;
}

interface ChatMsg {
  rol: 'user' | 'bot';
  texto: string;
  fuente?: string;
}

type RolUsuario = 'Vecino' | 'Comercio' | 'Fiscalizador' | 'Admin';

function limpiarTexto(valor: string): string {
  return valor.replace(/<[^>]*>?/gm, '').trim();
}

export default function ObservatorioPage() {
  const [pestana, setPestana] = useState<'comparador' | 'ingesta' | 'asistente'>('comparador');
  const [rolActual, setRolActual] = useState<RolUsuario>('Vecino');

  // Estado Comparador
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<'precio' | 'distancia'>('precio');
  const [precios, setPrecios] = useState<PrecioItem[]>([]);
  const [cargandoPrecios, setCargandoPrecios] = useState(true);
  const [errorPrecios, setErrorPrecios] = useState('');

  // Estado Ingesta
  const [productos, setProductos] = useState<ProductoOption[]>([]);
  const [sucursales, setSucursales] = useState<SucursalOption[]>([]);
  const [idProducto, setIdProducto] = useState<string>('');
  const [idSucursal, setIdSucursal] = useState<string>('');
  const [precioNormal, setPrecioNormal] = useState<string>('');
  const [precioOferta, setPrecioOferta] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [mensajeIngesta, setMensajeIngesta] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);

  // Estado Asistente
  const [mensajesChat, setMensajesChat] = useState<ChatMsg[]>([
    {
      rol: 'bot',
      texto:
        'Hola, soy el asistente del Observatorio de Precios Comunal (DIDESE - Pedro Aguirre Cerda). Pregúntame por precios de la canasta básica, locales cercanos o cómo registrar precios.',
      fuente: 'Observatorio PAC',
    },
  ]);
  const [preguntaChat, setPreguntaChat] = useState('');
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  const cargarPrecios = useCallback(async () => {
    setCargandoPrecios(true);
    setErrorPrecios('');
    try {
      const terminoLimpio = limpiarTexto(busqueda);
      const { data, error } = await supabase.rpc('buscar_precios_cercanos', {
        lat_usuario: -33.485,
        lon_usuario: -70.666,
        termino_busqueda: terminoLimpio,
      });

      if (error) {
        setErrorPrecios('No se pudieron cargar los precios desde Supabase.');
        setPrecios([]);
      } else {
        const lista = (data || []) as PrecioItem[];
        const ordenada = [...lista].sort((a, b) =>
          orden === 'precio'
            ? a.precio_efectivo - b.precio_efectivo
            : a.distancia_metros - b.distancia_metros
        );
        setPrecios(ordenada);
      }
    } catch {
      setErrorPrecios('Error de conexión al consultar los precios.');
    } finally {
      setCargandoPrecios(false);
    }
  }, [busqueda, orden]);

  const cargarCatalogoFormulario = useCallback(async () => {
    const [{ data: prodData }, { data: sucData }] = await Promise.all([
      supabase.from('producto').select('id_producto, nombre_homologado, unidad_medida').order('id_producto'),
      supabase
        .from('sucursal')
        .select('id_sucursal, direccion, comercio(nombre_razon_social)')
        .order('id_sucursal'),
    ]);

    if (prodData && prodData.length > 0) {
      setProductos(prodData);
      setIdProducto((prev) => prev || String(prodData[0].id_producto));
    }
    if (sucData && sucData.length > 0) {
      setSucursales(sucData as SucursalOption[]);
      setIdSucursal((prev) => prev || String(sucData[0].id_sucursal));
    }
  }, []);

  useEffect(() => {
    cargarPrecios();
  }, [cargarPrecios]);

  useEffect(() => {
    cargarCatalogoFormulario();
  }, [cargarCatalogoFormulario]);

  const puedeRegistrarPrecios = rolActual === 'Comercio' || rolActual === 'Fiscalizador' || rolActual === 'Admin';

  async function manejarRegistroPrecio(e: React.FormEvent) {
    e.preventDefault();
    setMensajeIngesta(null);

    if (!puedeRegistrarPrecios) {
      setMensajeIngesta({
        tipo: 'err',
        texto: 'Acceso denegado (RBAC): el rol Vecino solo tiene permisos de consulta.',
      });
      return;
    }

    const prodNum = Number(idProducto);
    const sucNum = Number(idSucursal);
    const normalNum = Number(precioNormal);
    const ofertaNum = precioOferta.trim() === '' ? null : Number(precioOferta);

    if (!Number.isInteger(prodNum) || prodNum <= 0 || !Number.isInteger(sucNum) || sucNum <= 0) {
      setMensajeIngesta({ tipo: 'err', texto: 'Selecciona un producto y una sucursal válidos.' });
      return;
    }

    if (!Number.isInteger(normalNum) || normalNum <= 0 || normalNum > 5000000) {
      setMensajeIngesta({ tipo: 'err', texto: 'El precio normal debe ser un número entero mayor a 0.' });
      return;
    }

    if (ofertaNum !== null && (!Number.isInteger(ofertaNum) || ofertaNum <= 0 || ofertaNum >= normalNum)) {
      setMensajeIngesta({
        tipo: 'err',
        texto: 'El precio oferta debe ser un entero positivo y menor al precio normal.',
      });
      return;
    }

    const idUsuarioPorRol = rolActual === 'Admin' ? 1 : rolActual === 'Fiscalizador' ? 2 : 3;

    setGuardandoPrecio(true);
    try {
      const { error } = await supabase.from('precio').insert({
        id_producto: prodNum,
        id_sucursal: sucNum,
        id_usuario_registra: idUsuarioPorRol,
        precio_normal: normalNum,
        precio_oferta: ofertaNum,
        fecha_vigencia_inicio: new Date().toISOString().slice(0, 10),
        fecha_vigencia_fin: fechaFin ? fechaFin : null,
      });

      if (error) {
        setMensajeIngesta({ tipo: 'err', texto: 'No fue posible guardar el precio en la base de datos.' });
      } else {
        setMensajeIngesta({ tipo: 'ok', texto: 'Precio registrado correctamente en Supabase.' });
        setPrecioNormal('');
        setPrecioOferta('');
        setFechaFin('');
        await cargarPrecios();
      }
    } catch {
      setMensajeIngesta({ tipo: 'err', texto: 'Error inesperado al registrar el precio.' });
    } finally {
      setGuardandoPrecio(false);
    }
  }

  async function manejarEnvioChat(e: React.FormEvent) {
    e.preventDefault();
    const textoLimpio = limpiarTexto(preguntaChat);
    if (!textoLimpio || enviandoChat) return;

    setPreguntaChat('');
    setMensajesChat((prev) => [...prev, { rol: 'user', texto: textoLimpio }]);
    setEnviandoChat(true);

    try {
      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: textoLimpio, conversationId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajesChat((prev) => [
          ...prev,
          { rol: 'bot', texto: data?.error || 'No pude responder en este momento.' },
        ]);
      } else {
        if (data?.conversationId) setConversationId(data.conversationId);
        setMensajesChat((prev) => [
          ...prev,
          { rol: 'bot', texto: data.respuesta, fuente: data.fuente },
        ]);
      }
    } catch {
      setMensajesChat((prev) => [
        ...prev,
        { rol: 'bot', texto: 'Error de red al contactar al asistente.' },
      ]);
    } finally {
      setEnviandoChat(false);
    }
  }

  function obtenerNombreComercio(com: SucursalOption['comercio']): string {
    if (!com) return 'Comercio';
    if (Array.isArray(com)) return com[0]?.nombre_razon_social || 'Comercio';
    return com.nombre_razon_social || 'Comercio';
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Encabezado */}
      <header className="border-b border-slate-800 bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <ShieldCheck className="h-4 w-4" />
              Municipalidad de Pedro Aguirre Cerda · DIDESE
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">
              Observatorio de Precios Comunal
            </h1>
            <p className="text-sm text-slate-400">
              Transparencia de precios de canasta básica y geolocalización con PostGIS
            </p>
          </div>

          {/* Selector de Rol RBAC */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm">
            <span className="text-slate-400">Rol activo:</span>
            <select
              aria-label="Rol activo"
              value={rolActual}
              onChange={(e) => setRolActual(e.target.value as RolUsuario)}
              className="rounded bg-slate-900 px-2 py-1 font-medium text-amber-300 outline-none ring-1 ring-slate-600"
            >
              <option value="Vecino">Vecino (Consulta)</option>
              <option value="Comercio">Comercio (Carga precios)</option>
              <option value="Fiscalizador">Fiscalizador (Terreno)</option>
              <option value="Admin">Admin DIDESE</option>
            </select>
          </div>
        </div>

        {/* Navegación */}
        <nav className="mx-auto flex max-w-6xl gap-2 px-4 pb-3">
          <button
            onClick={() => setPestana('comparador')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              pestana === 'comparador'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Search className="h-4 w-4" />
            Comparador y Cercanía
          </button>
          <button
            onClick={() => setPestana('ingesta')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              pestana === 'ingesta'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            Ingesta de Precios
          </button>
          <button
            onClick={() => setPestana('asistente')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              pestana === 'asistente'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Bot className="h-4 w-4" />
            Asistente IA
          </button>
        </nav>
      </header>

      {/* Contenido Principal */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {pestana === 'comparador' && (
          <section className="space-y-5">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar producto (ej. Marraqueta, Arroz, Aceite, Pollo)..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Ordenar por:</span>
                <button
                  onClick={() => setOrden('precio')}
                  className={`rounded-lg px-3 py-1.5 font-medium ${
                    orden === 'precio'
                      ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Menor precio
                </button>
                <button
                  onClick={() => setOrden('distancia')}
                  className={`rounded-lg px-3 py-1.5 font-medium ${
                    orden === 'distancia'
                      ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Más cercano
                </button>
              </div>
            </div>

            {errorPrecios && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
                {errorPrecios}
              </div>
            )}

            {cargandoPrecios ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
                Consultando precios y distancias en PostGIS...
              </div>
            ) : precios.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
                No se encontraron precios para ese filtro.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {precios.map((item) => {
                  const tieneOferta = item.precio_oferta !== null && item.precio_oferta < item.precio_normal;
                  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${item.latitud},${item.longitud}`;

                  return (
                    <article
                      key={item.id_precio}
                      className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                              <Tag className="h-3 w-3 text-amber-400" />
                              {item.categoria}
                            </span>
                            <h2 className="mt-2 text-lg font-semibold text-white">
                              {item.producto}
                            </h2>
                            <p className="text-xs text-slate-400">Unidad: {item.unidad_medida}</p>
                          </div>

                          <div className="text-right">
                            <div className="text-xl font-bold text-amber-400">
                              ${item.precio_efectivo.toLocaleString('es-CL')}
                            </div>
                            {tieneOferta && (
                              <div className="text-xs text-slate-400 line-through">
                                Normal: ${item.precio_normal.toLocaleString('es-CL')}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 space-y-1.5 border-t border-slate-800 pt-3 text-sm text-slate-300">
                          <div className="flex items-center gap-2 font-medium text-white">
                            <Store className="h-4 w-4 shrink-0 text-amber-400" />
                            <span>{item.comercio}</span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-400">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <span>
                              {item.direccion} · <strong>{item.distancia_metros} m</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-2">
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-400/60 hover:text-amber-300"
                        >
                          Ver ubicación en mapa
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {pestana === 'ingesta' && (
          <section className="mx-auto max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-bold text-white">Registro de Precios (Control RBAC)</h2>
            <p className="mt-1 text-sm text-slate-400">
              Permite a Comercio, Fiscalizador o Admin DIDESE publicar precios validados en Supabase.
            </p>

            {!puedeRegistrarPrecios && (
              <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-200">
                Estás navegando como <strong>Vecino</strong>. Cambia el rol arriba a{' '}
                <strong>Comercio</strong>, <strong>Fiscalizador</strong> o <strong>Admin DIDESE</strong> para habilitar el envío.
              </div>
            )}

            <form onSubmit={manejarRegistroPrecio} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Producto homologado</label>
                <select
                  value={idProducto}
                  onChange={(e) => setIdProducto(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                >
                  {productos.map((p) => (
                    <option key={p.id_producto} value={p.id_producto}>
                      {p.nombre_homologado} ({p.unidad_medida})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">Sucursal / Local en PAC</label>
                <select
                  value={idSucursal}
                  onChange={(e) => setIdSucursal(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                >
                  {sucursales.map((s) => (
                    <option key={s.id_sucursal} value={s.id_sucursal}>
                      {obtenerNombreComercio(s.comercio)} — {s.direccion}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-300">Precio normal (CLP)</label>
                  <input
                    type="number"
                    min={1}
                    max={5000000}
                    required
                    value={precioNormal}
                    onChange={(e) => setPrecioNormal(e.target.value)}
                    placeholder="Ej. 1990"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300">
                    Precio oferta (CLP, opcional)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000000}
                    value={precioOferta}
                    onChange={(e) => setPrecioOferta(e.target.value)}
                    placeholder="Ej. 1790"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Fecha fin de vigencia (opcional)
                </label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              {mensajeIngesta && (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    mensajeIngesta.tipo === 'ok'
                      ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
                      : 'border-red-500/40 bg-red-950/40 text-red-200'
                  }`}
                >
                  {mensajeIngesta.texto}
                </div>
              )}

              <button
                type="submit"
                disabled={guardandoPrecio || !puedeRegistrarPrecios}
                className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardandoPrecio ? 'Guardando...' : 'Publicar precio en Observatorio'}
              </button>
            </form>
          </section>
        )}

        {pestana === 'asistente' && (
          <section className="mx-auto flex max-w-3xl flex-col rounded-xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-3.5">
              <h2 className="text-lg font-bold text-white">Asistente Virtual Observatorio PAC</h2>
              <p className="text-xs text-slate-400">
                Conectado a MBot Studio (RAG / LLM) con respaldo de datos en Supabase
              </p>
            </div>

            <div className="max-h-[420px] space-y-3 overflow-y-auto p-5">
              {mensajesChat.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-line rounded-xl px-4 py-2.5 text-sm ${
                      m.rol === 'user'
                        ? 'bg-amber-400 font-medium text-slate-950'
                        : 'border border-slate-700 bg-slate-950 text-slate-100'
                    }`}
                  >
                    <div>{m.texto}</div>
                    {m.rol === 'bot' && m.fuente && (
                      <div className="mt-1.5 text-[11px] text-slate-400">Fuente: {m.fuente}</div>
                    )}
                  </div>
                </div>
              ))}
              {enviandoChat && (
                <div className="text-xs text-slate-400">Consultando al asistente...</div>
              )}
            </div>

            <form onSubmit={manejarEnvioChat} className="flex gap-2 border-t border-slate-800 p-4">
              <input
                type="text"
                value={preguntaChat}
                onChange={(e) => setPreguntaChat(e.target.value)}
                placeholder="Ej. ¿Dónde está más barata la marraqueta o qué hace un fiscalizador?"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={enviandoChat}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Enviar
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}