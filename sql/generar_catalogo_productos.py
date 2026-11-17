"""
generar_catalogo_productos.py — Genera sql/catalogo_productos.sql a partir del Excel
Catalogo_Productos_Uniformes.xlsx (hojas «Catalogo Productos» e «Indices de Marca»).

Uso:  python -X utf8 sql/generar_catalogo_productos.py "<ruta del .xlsx>"

Modelo de datos (ver sql/variantes_corte_manga.sql):
  - Producto = un modelo (p. ej. «Camisa / Blusa Corporativa Oxford Heli · Big Bang»), con su
    composición, qué incluye y notas.
  - Variante = corte × manga × talla × color, con su precio, stock 0, la clave del modelo del
    proveedor (HELI_DCP, C0300…) y SKU único.
  - Las filas del Excel que solo difieren en corte (caballero/dama/juvenil/niño…) o en manga
    (corta/larga/3/4) se juntan en un mismo producto.

Corte y manga:
  - Índices de Marca: de la clave cuando la sigue la convención del proveedor (Big Bang y Bibo:
    _CC, _CL, _DCP, _DLP, _CB…; Yazbek: C/D/J/N/B + número) y si no, del tipo de prenda.
    Si la clave y el texto no coinciden manda la clave; las diferencias se listan al generar.
  - Catálogo Productos: según AJUSTES_CATALOGO (una entrada por fila), porque ahí el corte viene
    en textos como «Dama y Caballero» o «Dama 2XS-2XL, Caballero 2XS-4XL».

Precios: «Precio 1-11 pz» o «Precio único» (sin IVA cuando dice «+ IVA»); tallas con sobreprecio
(+10 %, +20 %) llevan su precio. Vlank (precio de lista del proveedor) y lo que no trae precio
quedan vacíos. El precio de mayoreo (+12 pz) no se carga.
"""
import json
import re
import sys
import unicodedata
from collections import OrderedDict

import openpyxl

RUTA_XLSX = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Estor\Downloads\Uniformes Industriales\Catálogos\Catalogo_Productos_Uniformes.xlsx"
SALIDA = __file__.replace("generar_catalogo_productos.py", "catalogo_productos.sql")

MX = ["XCH", "CH", "M", "G", "XG", "2XG", "3XG", "4XG", "5XG"]
US = ["2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]


def rango(escala, a, b):
    return escala[escala.index(a): escala.index(b) + 1]


def lista(s):
    return [x.strip() for x in s.split(",") if x.strip()]


# ---------------------------------------------------------------------------------- tallas
TALLAS_TEXTO = {
    "A: XS,CH,M,G,XG | B: 44,46,48,58": ["XS", "CH", "M", "G", "XG", "44", "46", "48", "58"],
    "CH, M, G, XG (sobre pedido 2XG-5XG, +10%)": [("CH", 1), ("M", 1), ("G", 1), ("XG", 1)]
    + [(t, 1.10) for t in rango(MX, "2XG", "5XG")],
    "CH a XG estandar; 2XG-3XG +10%; 4XG-5XG +20%": [(t, 1) for t in rango(MX, "CH", "XG")]
    + [("2XG", 1.10), ("3XG", 1.10), ("4XG", 1.20), ("5XG", 1.20)],
    "No especificada en el PDF": [None],
    "S-XL, 2XL, 3XL": rango(US, "S", "3XL"),
    "S-XL, 2XL-3XL": rango(US, "S", "3XL"),
    "XS-XL, 2XL": rango(US, "XS", "2XL"),
    "XS-XL, 2XL-3XL": rango(US, "XS", "3XL"),
    "S-3XL": rango(US, "S", "3XL"),
    "2-14 (tallas infantiles)": ["2", "4", "6", "8", "10", "12", "14"],
    "2XS-2XL": rango(US, "2XS", "2XL"),
    "2XS-4XL": rango(US, "2XS", "4XL"),
}


def tallas(texto):
    """[(talla, factor de precio)]."""
    if texto is None or texto.strip() in ("N/A", ""):
        return [(None, 1)]
    t = texto.strip()
    if t in TALLAS_TEXTO:
        res = TALLAS_TEXTO[t]
    elif re.search(r"[:|;%]| a ", t):
        raise ValueError(f"Tallas sin regla: {t!r}")
    else:
        res = lista(t)
    return [x if isinstance(x, tuple) else (x, 1) for x in res]


# --------------------------------------------------------------------------------- colores
COLOR_SEPARAR = {"Marino Royal": ["Marino", "Royal"], "Salmón Fucsia": ["Salmón", "Fucsia"]}


def colores(texto, previos=None):
    if texto is None:
        return [None]
    t = texto.strip()
    if t in ("N/A", "") or t.lower().startswith("no especificad"):
        return [None]
    if t.startswith("Mismos 36 colores"):
        return previos
    m = re.match(r"36 colores solidos/jaspeados \((.*)\)$", t)
    if m:
        return [c for c in lista(m.group(1)) if c != "mas jaspeados"]
    m = re.match(r"(?:Solidos: )?(.*?)[.(]?\s*Jaspeados: (.*?)\)?$", t, re.I)
    if m:
        return lista(m.group(1).rstrip(". (")) + [f"{c} Jaspe" for c in lista(m.group(2))]
    t = t.replace(" (print camuflaje)", "")
    salida = []
    for c in lista(t):
        salida += COLOR_SEPARAR.get(c, [c])
    return salida


def precio(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"\$\s*([\d,]+(?:\.\d+)?)", str(v))
    return float(m.group(1).replace(",", "")) if m else None


def texto(v):
    """Texto limpio o None si viene vacío o como «no especificado»."""
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    if not s or s == "N/A" or s.lower().startswith("no especificad"):
        return None
    return s


def tipo_prenda(t):
    t = t.lower()
    if "polo" in t or t.startswith("playera"):
        return "playera"
    for clave, tipo in [
        ("sudadera", "sudadera"), ("chamarra", "chamarra"), ("softshell", "chamarra"), ("impermeable", "chamarra"),
        ("chaleco", "chaleco"), ("pantal", "pantalon"), ("bottom", "pantalon"), ("uniforme", "uniforme"),
        ("conjunto", "uniforme"), ("bata", "bata"), ("camisa", "camisa"), ("blusa", "camisa"), ("filipina", "camisa"),
        ("overol", "overol"), ("servicio", "otro"),
    ]:
        if t.startswith(clave) or (clave in ("chaleco", "softshell") and clave in t):
            return tipo
    if any(t.startswith(x) for x in ("corbat", "gorro", "limpi", "mandil")):
        return "accesorio"
    raise ValueError(f"Tipo sin regla: {t!r}")


def slug(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]", "", s.upper())


# ----------------------------------------------------------------------- corte y manga
CORTE_TEXTO = [
    (r"\bcon Silueta Dama\b", "Dama"), (r"\bCaballero\b", "Caballero"), (r"\bDama\b", "Dama"),
    (r"\bUnisex\b", "Unisex"), (r"\bJ[oó]venes\b", "Juvenil"), (r"\bNi[nñ]os\b", "Niño"),
    (r"\bBeb[eé]s\b", "Bebé"), (r"\bAdultos\b", "Unisex"),
]
MANGA_TEXTO = [(r"\bManga Corta\b", "Corta"), (r"\bManga Larga\b", "Larga"), (r"\bManga 3/4\b", "3/4"),
               (r"\bSin Mangas\b", "Sin mangas")]
CORTE_ABREV = {"Caballero": "C", "Dama": "D", "Unisex": "U", "Juvenil": "J", "Niño": "N", "Bebé": "B"}
MANGA_ABREV = {"Corta": "MC", "Larga": "ML", "3/4": "M34", "Sin mangas": "SM"}
SIN_MANGA = ("pantalon", "chaleco", "accesorio", "otro")


def separar(tipo):
    """(nombre base, corte, manga) a partir del tipo de prenda del Excel."""
    corte = manga = None
    base = tipo
    for patron, valor in CORTE_TEXTO:
        if re.search(patron, base):
            corte = corte or valor
            base = re.sub(patron, "", base)
    for patron, valor in MANGA_TEXTO:
        if re.search(patron, base):
            manga = valor
            base = re.sub(patron, "", base)
    base = re.sub(r"\bPinzada\b", "", base)
    base = re.sub(r"\s+", " ", base).strip()
    return base, corte, manga


def por_clave(codigo, marca):
    """(corte, manga) según la clave del proveedor, o (None, None) si no sigue la convención."""
    if marca == "Yazbek":
        return {"C": "Caballero", "D": "Dama", "J": "Juvenil", "N": "Niño", "B": "Bebé"}.get(codigo[0]), None
    sufijo = codigo.rsplit("_", 1)[-1] if "_" in codigo else ""
    m = re.fullmatch(r"(C|D)(CH|FC|FL|3/4|C|L|B|P)P?", sufijo)
    if not m:
        return None, None
    corte = "Caballero" if m.group(1) == "C" else "Dama"
    manga = {"C": "Corta", "L": "Larga", "3/4": "3/4"}.get(m.group(2))
    return corte, manga


# Nombres mal capturados en el catálogo de origen (la clave indica otro modelo).
NOMBRE_CORREGIDO = {
    "DRY_CC": "Camisa Corporativa Dry Caballero Manga Corta",
    "DRY_DC": "Blusa Corporativa Dry Dama Manga Corta",
}

# ---------------------------------------------- hoja Catálogo Productos: una entrada por fila
# (marca esperada, nombre del producto, código del producto, cortes, manga)
#   cortes: None, lista de cortes o {corte: tallas} cuando cada corte tiene su rango de tallas.
CD = ["Caballero", "Dama"]
PESCADOR = {"Caballero": "2XS-4XL", "Dama": "2XS-2XL"}
AJUSTES_CATALOGO = [
    ("Eurocoton", "Playera Tipo Polo · Eurocotton", "EUROCOTTON-POLO", None, None),
    ("Yazbek", None, None, None, None),  # C0550: viene de Índices de Marca
    ("Yazbek", None, None, None, None),  # D0550
    ("Maxima (opcion 1)", "Playera Tipo Polo · Máxima (opción 1)", "MAXIMA-POLO1", None, None),
    ("Maxima (opcion 2)", "Playera Tipo Polo · Máxima (opción 2)", "MAXIMA-POLO2", None, None),
    ("Gildan", "Playera Tipo Polo · Gildan", "GILDAN-POLO", None, None),
    ("Ultra Dry", "Playera Tipo Polo · Ultra Dry", "ULTRADRY-POLO",
     {"Dama": "CH, M, G, XG", "Caballero": "XS, CH, M, G, XG, 2XG, 3XG"}, None),
    ("Blue & White", "Playera Tipo Polo Dry · Blue & White", "BW-POLODRY", None, None),
    ("Blue & White (variante 3)", "Playera Tipo Polo Dry · Blue & White (variante 3)", "BW-POLODRY3", None, None),
    ("Bibo Dry", "Playera Tipo Polo · Bibo Dry", "BIBO-POLODRY", None, None),
    ("Dry UIS", "Playera Tipo Polo · Dry UIS", "UIS-POLODRY", None, None),
    ("Yazbek", "Playera Cuello Redondo · Yazbek", "YAZBEK-CR", None, None),
    ("Gildan", "Playera Cuello Redondo · Gildan", "GILDAN-CR", None, None),
    ("Eurocotton", "Playera Cuello Redondo · Eurocotton", "EUROCOTTON-CR", None, None),
    ("Yazbek (Dry)", "Playera Cuello Redondo Dry · Yazbek", "YAZBEK-CRDRY", None, None),
    ("Eurocottón (Dry)", "Playera Cuello Redondo Dry · Eurocotton", "EUROCOTTON-CRDRY", None, None),
    ("Sin marca", "Camisa / Blusa de mezclilla 14 oz con reflejante", "MEZCLILLA-14R", ["Caballero"], None),
    ("Sin marca", "Camisa de mezclilla 7.5 oz", "MEZCLILLA-75", ["Caballero"], None),
    ("Sin marca", "Camisa / Blusa de mezclilla 14 oz con reflejante", "MEZCLILLA-14R", ["Dama"], None),
    ("Sin marca", "Blusa de mezclilla 14 oz", "MEZCLILLA-14", ["Dama"], None),
    ("Sin marca", "Pantalón de mezclilla 14 oz", "MEZCLILLA-PAN", ["Caballero"], None),
    ("Sin marca", "Pantalón de mezclilla 14 oz", "MEZCLILLA-PAN", ["Dama"], None),
    ("Brigadista - Elite", "Chaleco Brigadista Elite", "BRIGADISTA-ELITE", None, None),
    ("Brigadista - Cerrado", "Chaleco Brigadista Cerrado", "BRIGADISTA-CERRADO", None, None),
    ("Brigadista - Elastico", "Chaleco Brigadista Elástico", "BRIGADISTA-ELASTICO", CD, None),
    ("Brigadista - Basico", "Chaleco Brigadista Básico", "BRIGADISTA-BASICO", None, None),
    ("Brigadista - Fresh Elite", "Chaleco Brigadista Fresh Elite", "BRIGADISTA-FRESH", None, None),
    ("Chamarra de Neopreno", "Chamarra de Neopreno · Uniformes Industriales de Saltillo", "UIS-NEOPRENO", CD, None),
    ("Mako Manga Larga", "Camisa tipo pescador Mako · Penta MX", "PENTA-MAKO", PESCADOR, "Larga"),
    ("Mako Manga Corta", "Camisa tipo pescador Mako · Penta MX", "PENTA-MAKO", PESCADOR, "Corta"),
    ("Mako TQ", "Camisa tipo pescador Mako TQ · Penta MX", "PENTA-MAKOTQ", PESCADOR, None),
    ("Mako Skin", "Camisa tipo pescador Mako Skin · Penta MX", "PENTA-MAKOSKIN", PESCADOR, None),
    ("Mako HD", "Camisa tipo pescador Mako HD · Penta MX", "PENTA-MAKOHD", PESCADOR, None),
    ("Mako FX4", "Camisa tipo pescador Mako FX4 · Penta MX", "PENTA-MAKOFX4", PESCADOR, None),
    ("Yuma Pro", "Camisa tipo pescador formal Yuma Pro · Penta MX", "PENTA-YUMAPRO", PESCADOR, None),
    ("Yuma TQ", "Camisa tipo pescador formal Yuma TQ · Penta MX", "PENTA-YUMATQ", PESCADOR, None),
    ("Blue & White - Cuello Redondo Dama y", "Playera Cuello Redondo · Blue & White", "BW-CR", CD, "Corta"),
    ("Blue & White - Cuello Redondo Manga Larga", "Playera Cuello Redondo · Blue & White", "BW-CR", None, "Larga"),
    ("Blue & White - Cuello Redondo Juvenil", "Playera Cuello Redondo · Blue & White", "BW-CR", ["Juvenil"], "Corta"),
    ("Blue & White - Polo Dama y", "Playera Tipo Polo · Blue & White", "BW-POLO", CD, "Corta"),
    ("Blue & White - Polo Manga Larga", "Playera Tipo Polo · Blue & White", "BW-POLO", None, "Larga"),
    ("Blue & White - Polo Combinada", "Playera Tipo Polo Combinada · Blue & White", "BW-POLOCOMB", None, None),
    ("Blue & White - Camisa Gabardina", "Camisa / Blusa de Gabardina · Blue & White", "BW-GABARDINA", CD, None),
    ("Blue & White - Sudadera Unisex", "Sudadera · Blue & White", "BW-SUDADERA", ["Unisex"], None),
    ("Blue & White - Sudadera Juvenil", "Sudadera · Blue & White", "BW-SUDADERA", ["Juvenil"], None),
    ("Blue & White - Sudadera Cierre", "Sudadera con cierre · Blue & White", "BW-SUDCIERRE", ["Unisex"], None),
    ("Blue & White - Chamarra", "Chamarra repelente al agua · Blue & White", "BW-CHAMARRA", ["Unisex"], None),
    ("Blue & White - Softshell Dama", "Softshell · Blue & White", "BW-SOFTSHELL", CD, None),
    ("Blue & White - Softshell Chaleco", "Chaleco softshell · Blue & White", "BW-CHALECO", CD, None),
    ("Vlank 18600", "Sudadera con cierre y capucha · Vlank 18600", "VLANK-18600", None, None),
    ("Vlank (sin clave", "Sudadera · Vlank (sin clave visible)", "VLANK-SUDADERA", None, None),
    ("Vlank 5400", "Playera manga larga · Vlank 5400", "VLANK-5400", ["Unisex"], "Larga"),
    ("Vlank 64400", "Playera manga larga · Vlank 64400", "VLANK-64400", ["Unisex"], "Larga"),
    ("Vlank CC8C", "Playera manga larga · Vlank CC8C", "VLANK-CC8C", ["Unisex"], "Larga"),
    ("Vlank S700", "Sudadera con capucha y bolsa · Vlank S700", "VLANK-S700", None, None),
    ("Vlank S450", "Sudadera con cierre 1/4 · Vlank S450", "VLANK-S450", None, None),
    ("Vlank S101", "Sudadera con capucha y bolsa · Vlank S101", "VLANK-S101", None, None),
    ("Vlank RW01W", "Sudadera crop top · Vlank RW01W", "VLANK-RW01W", ["Dama"], None),
    ("Vlank CO125", "Impermeable con cierre completo · Vlank CO125", "VLANK-CO125", None, None),
    ("Vlank CO200", "Impermeable con cierre 1/4 · Vlank CO200", "VLANK-CO200", None, None),
    ("Vlank - Cuello Redondo", "Playera Cuello Redondo · Vlank", "VLANK-CR", CD, "Larga"),
    ("Vlank - Polo Manga Larga", "Playera Tipo Polo · Vlank", "VLANK-POLO", CD, "Larga"),
    ("Vlank - Sudadera Unisex", "Sudadera con capucha y bolsa · Vlank", "VLANK-SUDCAPUCHA", ["Unisex"], None),
    ("Vlank - Sudadera Juvenil", "Sudadera con capucha y bolsa · Vlank", "VLANK-SUDCAPUCHA", ["Juvenil"], None),
    ("Vlank - Sudadera con Cierre", "Sudadera con cierre, capucha y bolsa · Vlank", "VLANK-SUDCIERRE", ["Unisex"], None),
    ("Vlank - Chamarra", "Chamarra repelente al agua · Vlank", "VLANK-CHAMARRA", ["Unisex"], None),
    ("Vlank - Softshell Dama", "Softshell · Vlank", "VLANK-SOFTSHELL", CD, None),
    ("Vlank - Softshell Chaleco", "Chaleco softshell · Vlank", "VLANK-CHALECO", CD, None),
]


def categoria_catalogo(marca, fuente):
    m = marca.lower()
    if fuente and fuente.startswith("INVIERNO"):
        return "Vlank"
    for clave, cat in [
        ("euroco", "Eurocotton"), ("yazbek", "Yazbek"), ("maxima", "Máxima"), ("gildan", "Gildan"),
        ("ultra dry", "Ultra Dry"), ("blue & white", "Blue & White"), ("bibo", "Bibo"),
        ("dry uis", "Uniformes Industriales de Saltillo"), ("neopreno", "Uniformes Industriales de Saltillo"),
        ("mako", "Penta MX (Mako & Yuma)"), ("yuma", "Penta MX (Mako & Yuma)"),
        ("sin marca", "Sin marca"), ("brigadista", "Sin marca"),
    ]:
        if clave in m:
            return cat
    raise ValueError(f"Marca sin categoría: {marca!r}")


def combinar(filas, campo):
    """Un solo texto por producto; si las filas difieren, se antepone a qué modelo/corte aplica."""
    grupos = OrderedDict()
    for f in filas:
        v = f[campo]
        if v:
            grupos.setdefault(v, []).append(f["etiqueta"])
    if not grupos:
        return None
    if len(grupos) == 1 and len(next(iter(grupos.values()))) == len(filas):
        return next(iter(grupos))
    return "\n".join(f"{', '.join(OrderedDict.fromkeys(et))}: {v}" for v, et in grupos.items())


def main():
    wb = openpyxl.load_workbook(RUTA_XLSX, data_only=True)
    productos = OrderedDict()  # código → datos del producto
    diferencias = []

    def producto(codigo, nombre, tipo, categoria):
        if codigo not in productos:
            productos[codigo] = dict(codigo=codigo, nombre=nombre, tipo=tipo, categoria=categoria, filas=[])
        p = productos[codigo]
        assert p["nombre"] == nombre and p["tipo"] == tipo and p["categoria"] == categoria, (codigo, nombre, p)
        return p

    # ---- Catálogo Productos
    precio_por_codigo = {}
    catalogo = [r for r in wb["Catalogo Productos"].iter_rows(min_row=2, values_only=True) if any(r)]
    assert len(catalogo) == len(AJUSTES_CATALOGO), (len(catalogo), len(AJUSTES_CATALOGO))
    previos = None
    for r, (marca_esp, nombre, codigo, cortes, manga) in zip(catalogo, AJUSTES_CATALOGO):
        fuente, marca, linea, cod_excel, tipo, comp, ts, cs, p1, pmay, punico, incluye, notas = r[:13]
        assert marca.startswith(marca_esp), (marca, marca_esp)
        es_vlank = bool(fuente and fuente.startswith("INVIERNO"))
        base = None if es_vlank else (precio(p1) if precio(p1) is not None else precio(punico))
        cols = colores(cs, previos)
        if cs and cs.startswith("36 colores"):
            previos = cols
        if cod_excel:  # C0550 / D0550: se cargan desde Índices de Marca con este precio
            precio_por_codigo[cod_excel] = base
            continue
        p = producto(codigo, nombre, tipo_prenda(tipo), categoria_catalogo(marca, fuente))
        if isinstance(cortes, dict):
            por_corte = [(c, tallas(TALLAS_TEXTO.get(t) and t or t)) for c, t in cortes.items()]
        else:
            por_corte = [(c, tallas(ts)) for c in (cortes or [None])]
        for corte, tl in por_corte:
            etiqueta = " ".join(x for x in (corte, f"manga {manga.lower()}" if manga else None) if x) or nombre
            sku = codigo + "".join(f"-{x}" for x in (CORTE_ABREV.get(corte), MANGA_ABREV.get(manga)) if x)
            p["filas"].append(dict(modelo=None, corte=corte, manga=manga, precio=base, tallas=tl, colores=cols,
                                   sku=sku, etiqueta=etiqueta, composicion=texto(comp), incluye=texto(incluye),
                                   notas=texto(notas)))

    # ---- Índices de Marca
    indices = [r for r in wb["Indices de Marca"].iter_rows(min_row=2, values_only=True) if any(r)]
    grupos = OrderedDict()
    for r in indices:
        fuente, marca, linea, codigo, tipo, comp, ts, cs, p1, pmay, incluye, pag, notas = r[:13]
        marca, linea = marca.strip(), (linea or "").strip()
        tipo = re.sub(r"\s+", " ", NOMBRE_CORREGIDO.get(codigo, tipo).strip())
        base, corte_t, manga_t = separar(tipo)
        corte_c, manga_c = por_clave(codigo, marca)
        if marca == "Yazbek" and corte_t == "Unisex":  # C07xx «Adultos»: la C es de adulto, no de caballero
            corte_c = None
        corte, manga = corte_c or corte_t, manga_c or manga_t
        if (corte_c and corte_t and corte_c != corte_t) or (manga_c and manga_t and manga_c != manga_t):
            diferencias.append(f"{codigo}: «{tipo}» → {corte} / manga {manga}")
        tp = tipo_prenda(tipo)
        if tp in SIN_MANGA:
            manga = None
        primera = base.split()[0]
        clave_base = re.sub(r"^Blusa\b", "Camisa", base)
        grupos.setdefault((marca, linea, clave_base), []).append(dict(
            codigo=codigo, primera=primera, base=base, tipo=tp, corte=corte, manga=manga,
            precio=precio_por_codigo.get(codigo, precio(p1)), tallas=tallas(ts), colores=colores(cs),
            composicion=texto(comp), incluye=texto(incluye), notas=texto(notas)))

    # Código de producto: la clave común de sus modelos (HELI, YZ-0300/0304…); si choca, se aclara.
    def codigo_grupo(marca, filas):
        if marca == "Yazbek":
            return "YZ-" + "/".join(sorted({f["codigo"][1:] for f in filas}))
        if len(filas) == 1:
            return filas[0]["codigo"]
        return "/".join(sorted({f["codigo"].rsplit("_", 1)[0] for f in filas}))

    candidatos = [(k, codigo_grupo(k[0], f)) for k, f in grupos.items()]
    choques = {}
    for k, c in candidatos:
        choques.setdefault(c, []).append(k[2])
    for (marca, linea, clave_base), cod in candidatos:
        filas = grupos[(marca, linea, clave_base)]
        if len(choques[cod]) > 1:  # se aclara con las palabras que distinguen al modelo
            comunes = set.intersection(*(set(b.split()) for b in choques[cod]))
            cod = f"{cod}-{slug(''.join(w for w in clave_base.split() if w not in comunes)) or 'BASE'}"
        primeras = OrderedDict.fromkeys(f["primera"] for f in filas)
        nombre_base = clave_base if len(primeras) == 1 else re.sub(r"^Camisa\b", "Camisa / Blusa", clave_base)
        if len(primeras) == 1:
            nombre_base = filas[0]["base"]
        nombre = f"{nombre_base} · {marca}" + (f" {linea}" if marca == "Yazbek" else "")
        tipos = {f["tipo"] for f in filas}
        assert len(tipos) == 1, (cod, tipos)
        p = producto(cod, nombre, tipos.pop(), marca)
        for f in filas:
            etiqueta = f["codigo"]
            p["filas"].append(dict(modelo=f["codigo"], corte=f["corte"], manga=f["manga"], precio=f["precio"],
                                   tallas=f["tallas"], colores=f["colores"], sku=f["codigo"], etiqueta=etiqueta,
                                   composicion=f["composicion"], incluye=f["incluye"], notas=f["notas"]))

    nombres = [p["nombre"] for p in productos.values()]
    dup = {n for n in nombres if nombres.count(n) > 1}
    for p in productos.values():
        if p["nombre"] in dup:
            p["nombre"] = f"{p['nombre']} ({p['codigo']})"

    # ---- Colores: un solo nombre por color (Neon = Neón, Azul rey = Azul Rey…)
    def clave(c):
        return unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode().lower()

    def puntaje(c):
        return (c != unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode(),
                all(w[0].isupper() for w in c.split() if w[0].isalpha()))

    canon = {}
    for p in productos.values():
        for f in p["filas"]:
            for c in f["colores"]:
                if c and (clave(c) not in canon or puntaje(c) > puntaje(canon[clave(c)])):
                    canon[clave(c)] = c
    canon.update({"fiucsa": "Fucsia", "fiusha": "Fucsia", "gris--francia": "Gris-Francia"})
    for p in productos.values():
        for f in p["filas"]:
            vistos = []
            for c in f["colores"]:
                c = canon[clave(c)] if c else None
                if c not in vistos:
                    vistos.append(c)
            f["colores"] = vistos

    # ---- Salida compacta y verificaciones
    listas_t, listas_c = [], []

    def indice(listas, valor):
        if valor not in listas:
            listas.append(valor)
        return listas.index(valor) + 1

    filas_p, filas_v, skus, combos = [], [], set(), set()
    for p in productos.values():
        filas_p.append([p["codigo"], p["nombre"], p["tipo"], p["categoria"], combinar(p["filas"], "composicion"),
                        combinar(p["filas"], "incluye"), combinar(p["filas"], "notas")])
        for f in p["filas"]:
            for t, _ in f["tallas"]:
                for c in f["colores"]:
                    sku = f["sku"] + "".join(f"-{slug(x)}" for x in (t, c) if x)
                    assert sku not in skus, sku
                    skus.add(sku)
                    combo = (p["codigo"], f["corte"], f["manga"], t, c)
                    assert combo not in combos, combo
                    combos.add(combo)
            filas_v.append([p["codigo"], f["modelo"], f["corte"], f["manga"], f["precio"], f["sku"],
                            indice(listas_t, [[t, x] for t, x in f["tallas"]]), indice(listas_c, f["colores"])])

    def js(x):
        s = json.dumps(x, ensure_ascii=False, separators=(",", ":"))
        assert "$j$" not in s
        return s

    SEP = ",\n"
    sin_precio = sum(1 for p in productos.values() if all(f["precio"] is None for f in p["filas"]))
    slug_sql = "upper(regexp_replace(translate({x}, 'ÁÉÍÓÚÑÜáéíóúñü', 'AEIOUNUaeiounu'), '[^A-Za-z0-9]', '', 'g'))"
    sql = f"""-- =====================================================================================
-- catalogo_productos.sql — Catálogo real de productos y variantes (Catalogo_Productos_Uniformes.xlsx).
-- GENERADO por sql/generar_catalogo_productos.py; no editar a mano. Requiere sql/variantes_corte_manga.sql.
--
-- {len(productos)} productos (un modelo cada uno) y {len(skus)} variantes corte × manga × talla × color,
-- stock 0; {sin_precio} productos sin precio de venta, pendientes de confirmar con el dueño. Categoría = marca.
--   _tallas:    [[talla, factor de precio], …]  (p. ej. 2XG-5XG +10 % → 1.1)
--   _colores:   [color, …]
--   _productos: [código, nombre, tipo_prenda, categoría, composición, incluye, notas]
--   _modelos:   [código del producto, modelo del proveedor, corte, manga, precio base, base del SKU,
--                lista de tallas, lista de colores]
-- SKU = base-TALLA-COLOR (mayúsculas, sin acentos ni signos).
-- Idempotente: no duplica productos (por código) ni variantes (por SKU).
-- =====================================================================================
create temp table _tallas as
select n as id, v as lista from jsonb_array_elements($j$[
{SEP.join(js(x) for x in listas_t)}
]$j$::jsonb) with ordinality as x(v, n);

create temp table _colores as
select n as id, v as lista from jsonb_array_elements($j$[
{SEP.join(js(x) for x in listas_c)}
]$j$::jsonb) with ordinality as x(v, n);

create temp table _productos as
select v->>0 as codigo, v->>1 as nombre, v->>2 as tipo, v->>3 as categoria,
       v->>4 as composicion, v->>5 as incluye, v->>6 as notas
from jsonb_array_elements($j$[
{SEP.join(js(x) for x in filas_p)}
]$j$::jsonb) as x(v);

create temp table _modelos as
select v->>0 as codigo, v->>1 as modelo, v->>2 as corte, v->>3 as manga, (v->>4)::numeric as precio,
       v->>5 as sku, (v->>6)::int as tallas, (v->>7)::int as colores
from jsonb_array_elements($j$[
{SEP.join(js(x) for x in filas_v)}
]$j$::jsonb) as x(v);

insert into public.categorias_producto (nombre)
select distinct categoria from _productos
on conflict (nombre) do nothing;

insert into public.productos (nombre, tipo_prenda, categoria_id, codigo, composicion, incluye, notas)
select c.nombre, c.tipo, cp.id, c.codigo, c.composicion, c.incluye, c.notas
from _productos c
join public.categorias_producto cp on cp.nombre = c.categoria
where not exists (select 1 from public.productos p where p.codigo = c.codigo);

insert into public.variantes_producto (producto_id, modelo, corte, manga, talla, color, stock, precio, sku)
select p.id, m.modelo, m.corte, m.manga, t.v->>0, k.v #>> '{{}}', 0, round(m.precio * (t.v->>1)::numeric, 2),
       m.sku || coalesce('-' || {slug_sql.format(x="t.v->>0")}, '')
             || coalesce('-' || {slug_sql.format(x="k.v #>> '{}'")}, '')
from _modelos m
join public.productos p on p.codigo = m.codigo
join _tallas lt on lt.id = m.tallas
join _colores lc on lc.id = m.colores
cross join lateral jsonb_array_elements(lt.lista) t(v)
cross join lateral jsonb_array_elements(lc.lista) k(v)
on conflict (sku) do nothing;

insert into public.tallas (nombre)
select distinct t.v->>0 from _tallas cross join lateral jsonb_array_elements(lista) t(v)
where t.v->>0 is not null
on conflict (nombre) do nothing;

insert into public.colores (nombre)
select distinct k.v #>> '{{}}' from _colores cross join lateral jsonb_array_elements(lista) k(v)
where k.v #>> '{{}}' is not null
on conflict (nombre) do nothing;

drop table _productos, _modelos, _tallas, _colores;
"""
    with open(SALIDA, "w", encoding="utf-8", newline="\n") as f:
        f.write(sql)
    print(f"{len(productos)} productos, {len(filas_v)} modelos/cortes, {len(skus)} variantes, "
          f"{sin_precio} sin precio → {SALIDA} ({len(sql) // 1024} KB)")
    if diferencias:
        print("Clave y texto no coinciden (se usó la clave):")
        for d in diferencias:
            print("  " + d)


if __name__ == "__main__":
    main()
