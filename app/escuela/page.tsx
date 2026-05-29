import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

export const metadata = { title: 'Escuelita — Clawbot' };

function Lesson({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
          {n}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-foreground/80">{children}</div>
    </Card>
  );
}

export default function EscuelaPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Escuelita Clawbot 🎓</h1>
        <p className="text-sm text-muted">Arbitraje de cripto explicado desde cero — y cómo lo hace este bot.</p>
      </div>

      <div className="space-y-3">
        <Lesson n={1} title="¿Qué es el arbitraje?">
          <p>
            Comprar un activo <strong>barato</strong> en un lugar y venderlo <strong>más caro</strong> en otro{' '}
            <em>casi al mismo tiempo</em>, capturando la diferencia con riesgo teórico cercano a cero. Bitcoin cotiza en
            cientos de exchanges 24/7 y los precios <strong>nunca</strong> son idénticos → ahí viven las oportunidades.
          </p>
        </Lesson>

        <Lesson n={2} title="Bid, Ask y Spread">
          <p>
            <strong>Bid</strong> = mejor precio al que alguien <em>compra</em>. <strong>Ask</strong> = mejor precio al que
            alguien <em>vende</em>. La diferencia es el <strong>spread</strong>.
          </p>
          <p>
            Hay arbitraje cuando el <strong>Ask de un exchange &lt; Bid de otro</strong>: compras barato en el primero y
            vendes caro en el segundo. Clawbot vigila esto en 4 exchanges en tiempo real.
          </p>
        </Lesson>

        <Lesson n={3} title="El order book y el VWAP (precio real)">
          <p>
            El <strong>order book</strong> tiene muchos niveles de precio con distinto volumen. Si quieres comprar mucho,
            "te comes" varios niveles y tu precio promedio empeora: eso es el <strong>VWAP</strong> (precio promedio
            ponderado por volumen).
          </p>
          <p>
            Por eso Clawbot no mira solo el mejor precio: <strong>camina el libro</strong> para calcular cuánto costaría
            ejecutar X BTC de verdad, y hace <strong>órdenes parciales</strong> si la liquidez no alcanza.
          </p>
        </Lesson>

        <Lesson n={4} title="Las 4 estrategias de Clawbot">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Espacial</strong>: mismo par entre dos exchanges (comprar barato en A, vender caro en B).
            </li>
            <li>
              <strong>Cross-quote</strong>: BTC/USD vs BTC/USDT (porque USD y USDT no valen exactamente lo mismo).
            </li>
            <li>
              <strong>Triangular</strong>: un ciclo dentro del mismo exchange, p.ej. USDT → BTC → ETH → USDT.
            </li>
            <li>
              <strong>Estadística</strong>: cuando el spread entre dos exchanges se aleja mucho de su promedio (z-score
              alto), se apuesta a que volverá a la media.
            </li>
          </ul>
        </Lesson>

        <Lesson n={5} title="¿Por qué es tan difícil? (el truco)">
          <p>
            Entre exchanges líquidos, las comisiones <strong>taker (~0.1% por lado = ~0.2% ida y vuelta)</strong> suelen
            ser <strong>mayores</strong> que el spread real (&lt;0.01%). Resultado: el arbitraje "fácil" casi nunca es
            rentable.
          </p>
          <p>
            Un bot <em>promedio</em> ejecutaría y perdería. Un bot <em>bueno</em> calcula el <strong>neto</strong> y{' '}
            <strong>rechaza</strong> lo que parece rentable en bruto pero pierde tras costos. Eso es lo que hace Clawbot.
          </p>
        </Lesson>

        <Lesson n={6} title="Los costos que matan la ganancia">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Trading fees</strong> (taker/maker) en cada exchange.
            </li>
            <li>
              <strong>Withdrawal fees</strong> al mover BTC entre plataformas (se amortizan entre varios trades).
            </li>
            <li>
              <strong>Slippage</strong>: el precio se mueve mientras ejecutas (latencia).
            </li>
            <li>
              <strong>Depeg</strong>: USDT ≠ USD exacto; convertir tiene un costo.
            </li>
          </ul>
          <p>Clawbot resta TODOS estos antes de decidir si ejecuta.</p>
        </Lesson>

        <Lesson n={7} title="Gestión de riesgo (circuit breakers)">
          <p>
            Igual que un coche tiene frenos, Clawbot tiene cortacircuitos: <strong>umbral mínimo neto</strong>, tope de
            tamaño por operación, límite de operaciones por minuto, <strong>halt</strong> tras varias pérdidas seguidas,{' '}
            <strong>wallet guard</strong> (nunca saldos negativos → fuerza parciales), y un <strong>kill switch</strong>{' '}
            global para apagar todo al instante.
          </p>
        </Lesson>

        <Lesson n={8} title="Noticias + IA">
          <p>
            Cada pocos minutos, un modelo de IA (Gemini) lee titulares de cripto y los resume en un{' '}
            <strong>sentimiento</strong> e <strong>impacto</strong>. Si hay una noticia de alto impacto negativo (un hack,
            una regulación), el bot entra en <strong>risk-off</strong> y pausa ejecuciones.
          </p>
          <p>
            Importante: la IA <strong>no decide el trade</strong> (eso es cuestión de microsegundos), solo{' '}
            <strong>modula el riesgo</strong> y te explica lo que pasa en el copiloto 🦅.
          </p>
        </Lesson>

        <Lesson n={9} title="Glosario rápido">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>bps</strong> (basis points): 1 bps = 0.01%. 100 bps = 1%.
            </li>
            <li>
              <strong>VWAP</strong>: precio promedio ponderado por volumen al caminar el libro.
            </li>
            <li>
              <strong>Taker/Maker</strong>: comisión por quitar liquidez (cruzas el spread) / poner liquidez.
            </li>
            <li>
              <strong>Slippage</strong>: diferencia entre el precio esperado y el real al ejecutar.
            </li>
            <li>
              <strong>Depeg</strong>: cuando una stablecoin (USDT) se desvía de su paridad ($1).
            </li>
            <li>
              <strong>P&amp;L</strong>: Profit &amp; Loss — la ganancia/pérdida acumulada.
            </li>
          </ul>
        </Lesson>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        ¿Dudas? Abre el copiloto 🦅 en el Dashboard y pregúntale lo que sea sobre el bot.
      </p>
    </div>
  );
}
