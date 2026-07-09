# Diccionario de datos — Sembrando Datos

Fuente: `public/data/agrodiversidad_ecuador_powerbi_2002_2025.csv` — 12.594 filas, 2002-2025, agroproducción del Ecuador por provincia y cultivo. Original: INEC-ESPAC, publicada por SIPA/MAG ([sipa.agricultura.gob.ec](https://sipa.agricultura.gob.ec/index.php/sipa-estadisticas/estadisticas-descargas/estadisticas-productivas)).

Cada fila es una combinación **provincia × cultivo × año**. El CSV trae 40 columnas; el proyecto usa 12 directamente para construir la narrativa y valida/tipa un grupo más amplio al cargar (ver `src/data/loadData.js`). Este documento cubre las tres categorías.

## 1. Columnas activas en la narrativa

Estas 12 son las que efectivamente alimentan cálculos, filtros o textos visibles en la página. `req.` marca las que `loadData.js` exige que existan o la carga falla con un error explícito.

| Columna | Tipo | Significado | Dónde se usa |
|---|---|---|---|
| `anio` **(req.)** | entero | Año calendario de la campaña agrícola (2002-2025). | Eje X del timeline, filtro de año en explorador/comparador, slider y carrera 2002→2025, anotaciones históricas. |
| `provincia` **(req.)** | texto | Provincia o zona del Ecuador. Incluye agregados históricos previos a 2012: `Nororiente` y `Centro-Suroriente` (antes de que la Amazonía se reportara por provincia individual). | Mapa coroplético, comparador "cara a cara", filtro del explorador, ranking provincial. |
| `region_natural` **(req.)** | texto | Región natural: `Costa`, `Sierra`, `Amazonía`, `Amazonía agrupada`, o vacío para zonas sin clasificar. | Color de los puntos en el scatter de diversidad, etiqueta en el tooltip del mapa, filtro del explorador. |
| `cultivo` **(req.)** | texto | Nombre del cultivo junto a su forma de producto, ej. `Maíz Duro Seco (Grano Seco)`. | Ranking de cultivos, timeline por cultivo, filtro y carrera del explorador, cultivo estrella en conclusiones. |
| `grupo_cultivo` **(req.)** | texto | Categoría agronómica del cultivo (ej. `Cereales y pseudocereales`, `Frutales`). | Barras por grupo y ciclo, modo "Grupo" del timeline, filtro del explorador. |
| `ciclo_cultivo` **(req.)** | texto | Ciclo productivo: `Permanente` (varios años de cosecha) o `Transitorio` (una cosecha por siembra). | Apilado permanente/transitorio en "Región, ciclo y grupo de cultivo". |
| `produccion_t` **(req.)** | numérico | Producción total en toneladas métricas. La métrica central del proyecto. | KPIs, relleno del mapa coroplético, ranking, timeline, comparador, carrera del explorador, conclusiones. |
| `superficie_cosechada_ha` **(req.)** | numérico | Hectáreas efectivamente cosechadas (no plantadas: descuenta pérdidas). | KPIs, comparador, explorador, base del rendimiento. |
| `rendimiento_t_ha` **(req.)** | numérico | Rendimiento agrícola = producción ÷ superficie cosechada, en t/ha. | Ranking (promedio), comparador, KPI "Rendimiento prom." del explorador. |
| `indice_diversidad_shannon_normalizado` **(req.)** | numérico (0-1) | Índice de diversidad de Shannon normalizado de la canasta de cultivos de la provincia ese año. Más alto = provincia más diversificada. | Eje X del scatter de diversidad, insight "provincia más diversa", comparador. |
| `indice_concentracion_hhi_superficie` **(req.)** | numérico (0-1) | Índice Herfindahl-Hirschman de concentración de superficie por cultivo. Más alto = superficie concentrada en pocos cultivos. | Eje Y del scatter de diversidad. |
| `calidad_dato` | texto | Calidad del registro asignada por la fuente: `Completo`, `Parcial: valores ausentes` o `Parcial: confidencialidad`. | "Calidad dominante" en conclusiones (`qualityBreakdown`). |
| `url_fuente_estadistica` | texto (URL) | Enlace a la página oficial de SIPA/MAG de donde proviene el dato. | Código QR en la sala de conclusiones (se genera 100% local, sin llamada de red). |

## 2. Columnas tipadas pero sin uso visual todavía

`loadData.js` las convierte a número (coma decimal → punto, vacíos → `null`) igual que las de la tabla anterior, para que estén listas si una futura sala quiere usarlas — pero hoy ninguna sala las muestra.

| Columna | Significado |
|---|---|
| `superficie_plantada_ha` | Hectáreas sembradas totales (antes de cualquier pérdida de cosecha). |
| `superficie_plantada_solo_ha` / `_asociado_ha` / `_invernadero_ha` | Desagregación de la superficie plantada por modalidad: monocultivo, cultivo asociado o bajo invernadero. |
| `produccion_solo_t` / `_asociado_t` / `_invernadero_t` | La misma desagregación pero sobre la producción en toneladas. |
| `componentes_ocultos_confidencialidad` | Cuántos subcomponentes de la fila se ocultaron por confidencialidad estadística. |
| `componentes_con_valores_ausentes` | Cuántos subcomponentes de la fila quedaron sin dato. |
| `superficie_cosechada_nacional_ha` / `produccion_nacional_t` | Totales nacionales de ese cultivo en ese año (base para calcular participaciones). |
| `participacion_superficie_nacional_pct` / `participacion_produccion_nacional_pct` | % que representa esa fila (provincia+cultivo) sobre el total nacional del año. |
| `ranking_produccion_provincial` | Posición de esa provincia en producción de ese cultivo, ese año. |
| `cultivos_reportados_provincia_anio` | Cantidad de cultivos distintos reportados en esa provincia ese año. |
| `superficie_agricola_reportada_provincia_ha` | Superficie agrícola total reportada en la provincia ese año (todos los cultivos). |
| `participacion_cultivo_superficie_provincial_pct` | % de la superficie provincial que ocupa este cultivo específico. |
| `variacion_produccion_interanual_pct` / `variacion_rendimiento_interanual_pct` | Variación porcentual de producción/rendimiento respecto al año anterior. |

**Ideas de uso futuro:** `variacion_produccion_interanual_pct` serviría para una sala de "mayores subidas/caídas del año"; `participacion_produccion_nacional_pct` podría reemplazar cálculos manuales de participación que hoy se hacen en el cliente (`sectionRegistry.js`, `provinceCompare.js`).

## 3. Columnas del CSV sin usar en el proyecto

Metadatos de la fuente original (Power BI / geoportal del MAG) que no aportan a la narrativa de datos:

`pais` (siempre "Ecuador"), `ubicacion_powerbi` (etiqueta "Provincia, Ecuador" para mapas de Power BI), `nombre_original_sipa`, `forma_producto`, `monitoreo_satelital_geoportal` (Sí/No), `tipo_integracion_geoportal` (ej. "Capa específica de estimación de superficie"), `escala_geoportal_referencial` (ej. "1:25.000"), `fuente_estadistica`, `url_geoportal`.

## Notas de limpieza

- **Filas descartadas al cargar**: cualquier fila sin `anio`, `provincia` o `cultivo` válidos se elimina silenciosamente (`loadData.js`).
- **Decimales**: el CSV usa coma decimal (`0,4396`); `toNumber()` la convierte a punto antes de parsear.
- **Emparejamiento de nombres geográficos**: el TopoJSON de provincias no lleva tildes (`Bolivar`, `Los Rios`); `normalizeName()` en `provinceMap.js` normaliza ambos lados (CSV y geometría) para casarlos.
- **Formato de salida**: todos los números que se muestran en pantalla pasan por `fmt.*` (`src/data/aggregateData.js`), con locale es-EC (coma decimal, punto de miles) — no reflejan el formato crudo del CSV.
