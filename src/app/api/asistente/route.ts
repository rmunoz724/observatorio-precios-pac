import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const MBOT_URL = (process.env.MBOT_API_URL || 'http://localhost:3000').replace(/\/$/, '');

function sanitizarTexto(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 600);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mensaje = sanitizarTexto(body?.mensaje);
    const conversationId =
      typeof body?.conversationId === 'string' && body.conversationId.trim() !== ''
        ? body.conversationId.slice(0, 100)
        : undefined;

    if (!mensaje) {
      return NextResponse.json(
        { error: 'Debes escribir una consulta válida.' },
        { status: 400 }
      );
    }

    // 1. Intentar conectar con MBot Studio
    try {
      const botsRes = await fetch(`${MBOT_URL}/api/bots`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });

      if (botsRes.ok) {
        const botsData = await botsRes.json();
        const botsList = Array.isArray(botsData) ? botsData : botsData?.bots || [];
        const botObjetivo =
          botsList.find((b: { name?: string }) =>
            b.name?.toLowerCase().includes('observatorio')
          ) || botsList[0];

        if (botObjetivo?.id) {
          const chatRes = await fetch(`${MBOT_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bot_id: botObjetivo.id,
              message: mensaje,
              ...(conversationId ? { conversation_id: conversationId } : {}),
            }),
            signal: AbortSignal.timeout(25000),
          });

          if (chatRes.ok) {
            const chatData = await chatRes.json();
            const respuestaBot =
              chatData?.response ||
              chatData?.reply ||
              chatData?.message?.content ||
              chatData?.content ||
              'Respuesta recibida desde MBot Studio.';

            return NextResponse.json({
              respuesta: respuestaBot,
              fuente: `MBot Studio (${botObjetivo.name})`,
              conversationId: chatData?.conversation_id || chatData?.conversationId || conversationId || null,
            });
          }
        }
      }
    } catch {
      // Si MBot local no está levantado (por ejemplo en nube), pasamos al respaldo con Supabase
    }

    // 2. Respaldo directo con datos reales de Supabase (PostGIS)
    const palabrasClave = mensaje
      .toLowerCase()
      .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(
        (p) =>
          p.length >= 3 &&
          !['precio', 'precios', 'donde', 'dónde', 'esta', 'está', 'mas', 'más', 'barato', 'cerca', 'pac'].includes(p)
      );

    const termino = palabrasClave[0] || '';
    const { data: precios } = await supabase.rpc('buscar_precios_cercanos', {
      lat_usuario: -33.485,
      lon_usuario: -70.666,
      termino_busqueda: termino,
    });

    const lista = Array.isArray(precios) ? precios.slice(0, 5) : [];

    if (lista.length > 0) {
      const lineas = lista.map((item) => {
        const valor = item.precio_oferta ?? item.precio_normal;
        return `• **${item.producto}** (${item.unidad_medida}) en **${item.comercio}** (${item.direccion}): **$${Number(valor).toLocaleString('es-CL')}** a ${item.distancia_metros} m`;
      });

      return NextResponse.json({
        respuesta: `Según los registros del Observatorio de Precios en Pedro Aguirre Cerda:\n\n${lineas.join('\n')}`,
        fuente: 'Supabase PostgreSQL + PostGIS (Respaldo)',
      });
    }

    return NextResponse.json({
      respuesta:
        'Puedo ayudarte a consultar precios de la canasta básica (pan marraqueta, arroz, aceite, leche, huevos, pollo), ver locales cercanos en Pedro Aguirre Cerda o resolver dudas sobre los roles de Vecino, Comercio, Fiscalizador y DIDESE.',
      fuente: 'Asistente Observatorio PAC',
    });
  } catch {
    return NextResponse.json(
      { error: 'No fue posible procesar la consulta en este momento.' },
      { status: 500 }
    );
  }
}