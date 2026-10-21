from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_ALIGN_VERTICAL, WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "海洋呼吸任务_现有海洋生物素材真实性审查与文献依据_更新版.docx"
WORK = ROOT / "report_assets" / "processed"
WORK.mkdir(parents=True, exist_ok=True)

FONT_CJK = "Microsoft JhengHei"
TEAL_DARK = "073848"
TEAL = "0B6670"
TEAL_LIGHT = "DCEFF0"
GOLD = "C79A31"
GOLD_LIGHT = "F5EACB"
INK = "17323B"
MUTED = "526A73"
OFFWHITE = "F6F3EA"
WHITE = "FFFFFF"
RED = "A94F45"
GREEN = "34775F"


def set_cell_shading(cell, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), color)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for key, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{key}"))
        if node is None:
            node = OxmlElement(f"w:{key}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_table_fixed(table, widths_twips: Iterable[int]) -> None:
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_pr = table._tbl.tblPr
    layout = tbl_pr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tbl_pr.append(layout)
    layout.set(qn("w:type"), "fixed")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_twips:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(widths_twips[index]))
            tc_w.set(qn("w:type"), "dxa")


def set_run_font(run, size: float | None = None, bold: bool | None = None, color: str | None = None,
                 italic: bool | None = None, font: str = FONT_CJK) -> None:
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:eastAsia"), font)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)


def set_paragraph_spacing(paragraph, before=0, after=0, line=1.04) -> None:
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = line


def add_text(paragraph, text: str, *, size=9.3, bold=False, color=INK, italic=False) -> None:
    run = paragraph.add_run(text)
    set_run_font(run, size=size, bold=bold, color=color, italic=italic)


def add_hyperlink(paragraph, text: str, url: str, *, size=8.2, color=TEAL, bold=False) -> None:
    part = paragraph.part
    rel_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    r_fonts = OxmlElement("w:rFonts")
    r_fonts.set(qn("w:ascii"), FONT_CJK)
    r_fonts.set(qn("w:eastAsia"), FONT_CJK)
    r_pr.append(r_fonts)
    color_node = OxmlElement("w:color")
    color_node.set(qn("w:val"), color)
    r_pr.append(color_node)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    r_pr.append(underline)
    size_node = OxmlElement("w:sz")
    size_node.set(qn("w:val"), str(int(size * 2)))
    r_pr.append(size_node)
    if bold:
        r_pr.append(OxmlElement("w:b"))
    run.append(r_pr)
    text_node = OxmlElement("w:t")
    text_node.text = text
    run.append(text_node)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def add_bottom_border(paragraph, color=GOLD, size=14) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    borders = p_pr.find(qn("w:pBdr"))
    if borders is None:
        borders = OxmlElement("w:pBdr")
        p_pr.append(borders)
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "5")
    bottom.set(qn("w:color"), color)
    borders.append(bottom)


def set_alt_text(inline_shape, title: str, description: str) -> None:
    doc_pr = inline_shape._inline.docPr
    doc_pr.set("name", title)
    doc_pr.set("descr", description)


def normalize_image(source: Path, target: Path, *, mode: str, background: str) -> None:
    canvas_size = (1200, 680)
    with Image.open(source) as original:
        image = original.convert("RGBA")
        if mode == "cover":
            ratio = max(canvas_size[0] / image.width, canvas_size[1] / image.height)
            resized = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
            left = (resized.width - canvas_size[0]) // 2
            top = (resized.height - canvas_size[1]) // 2
            canvas = resized.crop((left, top, left + canvas_size[0], top + canvas_size[1]))
        else:
            canvas = Image.new("RGBA", canvas_size, background)
            ratio = min(900 / image.width, 500 / image.height)
            resized = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
            x = (canvas_size[0] - resized.width) // 2
            y = (canvas_size[1] - resized.height) // 2
            canvas.alpha_composite(resized, (x, y))
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((3, 3, canvas_size[0] - 4, canvas_size[1] - 4), radius=20, outline="#5B858C", width=6)
        canvas.convert("RGB").save(target, quality=92)


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    add_text(paragraph, "海洋呼吸任務｜素材真實性審查　", size=8, color=MUTED)
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr_text)
    run._r.append(fld_char2)
    set_run_font(run, size=8, color=MUTED)


def add_page_header(doc: Document, eyebrow: str, title: str, subtitle: str = "") -> None:
    p = doc.add_paragraph()
    set_paragraph_spacing(p, after=2)
    add_text(p, eyebrow.upper(), size=9, bold=True, color=GOLD)
    title_p = doc.add_paragraph()
    set_paragraph_spacing(title_p, after=3, line=1)
    add_text(title_p, title, size=22, bold=True, color=TEAL_DARK)
    add_bottom_border(title_p, color=GOLD, size=12)
    if subtitle:
        sub = doc.add_paragraph()
        set_paragraph_spacing(sub, after=6)
        add_text(sub, subtitle, size=9.4, color=MUTED)


def add_badge(paragraph, text: str, color: str) -> None:
    run = paragraph.add_run(f"  {text}  ")
    set_run_font(run, size=9, bold=True, color=WHITE)
    r_pr = run._element.get_or_add_rPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color)
    r_pr.append(shd)


def add_label_value(cell, label: str, value: str, *, label_color=TEAL) -> None:
    p = cell.add_paragraph() if cell.text else cell.paragraphs[0]
    set_paragraph_spacing(p, after=2, line=1.05)
    add_text(p, f"{label}　", size=8.8, bold=True, color=label_color)
    add_text(p, value, size=9.1, color=INK)


def add_bullet(cell, text: str, *, color=INK, size=9.0) -> None:
    p = cell.add_paragraph(style="List Bullet")
    set_paragraph_spacing(p, after=2, line=1.06)
    add_text(p, text, size=size, color=color)


species = [
    {
        "number": "01",
        "slug": "neopomacentrus_bankieri",
        "current": ROOT / "public/assets/chapter1/creatures/individual/subject-blue-damselfish.png",
        "real": ROOT / "report_assets/real/neopomacentrus_bankieri_underwater.jpg",
        "name_zh": "黃尾石剎／斑氏新雀鯛",
        "name_en": "Chinese damselfish",
        "scientific": "Neopomacentrus bankieri",
        "decision": "徹底替換",
        "decision_color": RED,
        "final_label": "替換目標",
        "final_target": "黃尾石剎／斑氏新雀鯛（Neopomacentrus bankieri）",
        "summary": "現有藍色雀鯛缺少真魚最明顯的黃橙色尾部，不能可靠代表本種；定稿版改用具黃尾特徵的新圖。",
        "traits": "小型雀鯛，體色藍灰至灰褐；尾鰭與尾柄帶明顯黃橙色。最大體長約 8 cm。",
        "habitat": "沿岸礁區，常見於珊瑚或岩石突起附近的軟底環境；FishBase 記錄深度約 3–12 m。",
        "role": "可放在「小型礁魚」層，作為較大型魚類的獵物；遊戲中不宜把單一照片直接當作完整食性證明。",
        "hk": "香港漁護署人工魚礁魚類名錄列出本種，名稱為「黃尾石剎／Chinese damselfish」。",
        "game": "淘汰現有藍色圖；重新製作黃尾石剎，保留藍灰體色、黃橙尾柄與尾鰭，以及小型礁魚體形。",
        "photo_credit": "amfstocker／iNaturalist photo 167871431／CC BY 4.0（Wikimedia Commons 收錄）",
        "photo_url": "https://commons.wikimedia.org/wiki/File:Neopomacentrus_bankieri,_The_Keppels_QLD_4700,_Australia_imported_from_iNaturalist_photo_167871431.jpg",
        "fishbase": "https://www.fishbase.se/summary/Neopomacentrus-bankieri.html",
        "worms": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=278911",
        "commons": "https://commons.wikimedia.org/wiki/Category:Neopomacentrus_bankieri",
        "afcd_note": "AFCD 名錄第 3 頁：Neopomacentrus bankieri／黃尾石剎。",
    },
    {
        "number": "02",
        "slug": "lutjanus_russellii",
        "current": ROOT / "public/assets/chapter1/creatures/individual/subject-silver-reef-fish.png",
        "real": ROOT / "report_assets/real/lutjanus_russellii.jpg",
        "name_zh": "火點／勒氏笛鯛",
        "name_en": "Russell's snapper",
        "scientific": "Lutjanus russellii",
        "decision": "徹底替換",
        "decision_color": RED,
        "final_label": "替換目標",
        "final_target": "火點／勒氏笛鯛（Lutjanus russellii）",
        "summary": "現有銀色魚輪廓過於通用，缺少勒氏笛鯛最重要的黑色側斑，無法讓學生可靠辨認。",
        "traits": "體色銀白至淡粉；身體上方、背鰭軟條前下方常有醒目的黑色斑點，部分個體鰭帶黃色。",
        "habitat": "成魚多見於礁區；幼魚可進入紅樹林與河口。FishBase 記錄 3–80 m，常見約 20–50 m。",
        "role": "捕食底棲無脊椎動物及魚類，可擔任食物鏈中的中大型捕食者；需避免把所有銀色魚都命名為本種。",
        "hk": "香港漁護署人工魚礁魚類名錄列出本種，粵名「火點」、英文名 Russell's snapper。",
        "game": "淘汰通用銀色魚圖；重新製作火點，清楚保留背鰭下方的黑色側斑、笛鯛體形與淡色魚身。",
        "photo_credit": "Donald Davesne／iNaturalist observation 194379550／CC BY",
        "photo_url": "https://www.inaturalist.org/observations/194379550",
        "fishbase": "https://www.fishbase.se/summary/Lutjanus-russellii.html",
        "worms": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=218473",
        "commons": "https://commons.wikimedia.org/wiki/Category:Lutjanus_russellii",
        "afcd_note": "AFCD 名錄第 2 頁：Lutjanus russellii／火點。",
    },
    {
        "number": "03",
        "slug": "epinephelus_akaara",
        "current": ROOT / "public/assets/chapter1/creatures/individual/subject-reef-grouper.png",
        "real": ROOT / "report_assets/real/epinephelus_akaara.jpg",
        "name_zh": "紅斑／香港石斑魚",
        "name_en": "Hong Kong grouper / Red-spotted grouper",
        "scientific": "Epinephelus akaara",
        "decision": "改名",
        "decision_color": GOLD,
        "final_label": "最終名稱",
        "final_target": "紅斑／香港石斑魚（Epinephelus akaara）",
        "summary": "現有石斑魚的體形與點斑方向合理，可保留圖像並定名為紅斑／香港石斑魚；輸出前強化紅橙斑點。",
        "traits": "體色淡褐灰，身體、頭部與各鰭布有紅、橙或金色小斑點，側面可見淡色橫帶。",
        "habitat": "西北太平洋岩礁魚；幼魚常在淺於 10 m 水域，整體記錄可至約 55 m。",
        "role": "捕食甲殼類與小魚，可放在食物鏈上層；它是適合連結「小魚變少會影響捕食者」的代表。",
        "hk": "香港漁護署人工魚礁魚類名錄列出本種，名稱「紅斑／Red grouper」。",
        "game": "保留現有石斑圖，介面名稱定為「紅斑／香港石斑魚」；輸出前再強化紅橙斑點與淡色橫帶。",
        "photo_credit": "りなべる／iNaturalist observation 67076404／CC BY",
        "photo_url": "https://www.inaturalist.org/observations/67076404",
        "fishbase": "https://www.fishbase.se/summary/Epinephelus-akaara.html",
        "worms": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=273833",
        "commons": "https://commons.wikimedia.org/wiki/Category:Epinephelus_akaara",
        "afcd_note": "AFCD 名錄第 4 頁：Epinephelus akaara／紅斑。",
    },
    {
        "number": "04",
        "slug": "bathygobius_fuscus",
        "current": ROOT / "public/assets/chapter1/creatures/individual/subject-hardy-goby.png",
        "real": ROOT / "report_assets/real/bathygobius_fuscus.jpeg",
        "name_zh": "深鰕虎魚／褐深鰕虎",
        "name_en": "Dusky frillgoby",
        "scientific": "Bathygobius fuscus",
        "decision": "徹底替換",
        "decision_color": RED,
        "final_label": "替換目標",
        "final_target": "深鰕虎魚／褐深鰕虎（Bathygobius fuscus）",
        "summary": "現有素材原先帶有「眼斑鰕虎魚」語意，與深鰕虎魚並非同一項紀錄；應先退回到類群名稱。",
        "traits": "體色淡黃褐，帶不規則深色斑塊與細小淺藍點；底棲體形、胸鰭寬，適合貼近岩面活動。",
        "habitat": "淺水岩岸、潮池、沿岸與河口環境；FishBase 記錄約 0–6 m。",
        "role": "攝食甲殼類、小魚與藻類，可作底層小型消費者；同時會被較大型魚類捕食。",
        "hk": "香港漁護署名錄同時列有 Bathygobius fuscus（深鰕虎魚）及另一項 Eye-marked goby，不能互相代換。",
        "game": "淘汰原有「眼斑」素材；重新製作深鰕虎魚，呈現褐色斑塊、細小淺藍點、寬胸鰭與貼底姿態。",
        "photo_credit": "coenobita／iNaturalist observation 10339608／CC BY",
        "photo_url": "https://www.inaturalist.org/observations/10339608",
        "fishbase": "https://www.fishbase.se/summary/Bathygobius-fuscus.html",
        "worms": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=209215",
        "commons": "https://commons.wikimedia.org/wiki/Category:Bathygobius_fuscus",
        "afcd_note": "AFCD 名錄第 1 頁：Bathygobius fuscus／深鰕虎魚；另列 Istigobius diadema／Eye-marked goby。",
    },
    {
        "number": "05",
        "slug": "holothuria_leucospilota",
        "current": ROOT / "public/assets/chapter1/creatures/individual/subject-sea-cucumber_frames/_2026-08-15_213443___00.png",
        "real": ROOT / "report_assets/real/holothuria_leucospilota.jpeg",
        "name_zh": "海參（類群層級）",
        "name_en": "Sea cucumber (group-level reference)",
        "scientific": "Holothuroidea（海參綱；不指定物種）",
        "decision": "保留",
        "decision_color": GREEN,
        "final_label": "保留名稱",
        "final_target": "海參（Holothuroidea 類群層級，不指定物種）",
        "summary": "現有米黃色海參具有細長柔軟、貼近海床的遊戲辨識特徵，可保留作類群圖示；但僅憑顏色與突起不足以鑑定到物種。",
        "traits": "海參通常具有柔軟、細長或圓筒狀身體，表面可見大小不一的疣足或乳突；不同物種的體色與表面紋理差異很大。",
        "habitat": "多在海床活動，可見於岩礁、砂地、碎珊瑚與其他底質；遊戲中應保持貼底而非漂浮。",
        "role": "許多海參是沉積攝食者，攝食海床表層有機物與沉積物，參與底質整理及營養循環。",
        "hk": "香港水域記錄有多種海參；右圖的 H. leucospilota 只作真實物種比較，不代表現有遊戲素材已鑑定為該種。",
        "game": "保留現有米黃色海參素材與緩慢貼底動畫；遊戲內只使用「海參」類群名稱，不標示為 H. leucospilota。",
        "photo_credit": "物種比較參考：Ewout Knoester／iNaturalist observation 18306538／CC BY-SA",
        "photo_url": "https://www.inaturalist.org/observations/18306538",
        "fishbase": "https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2021.739657/full",
        "worms": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=210881",
        "commons": "https://commons.wikimedia.org/wiki/Category:Holothuria_leucospilota",
        "afcd_note": "香港珊瑚礁普查 2025 結果摘要列出 common black sea cucumber。",
    },
    {
        "number": "06",
        "slug": "tube_sponge_reference",
        "current": ROOT / "public/assets/chapter1/creatures/individual/subject-tube-sponge___frames/subject-tube-sponge___00.png",
        "real": ROOT / "report_assets/real/tube_sponge_reference.jpg",
        "name_zh": "管狀海綿（類群層級）",
        "name_en": "Tube sponge (group-level reference)",
        "scientific": "Porifera；示例照片為 Aplysina archeri",
        "decision": "保留",
        "decision_color": GREEN,
        "final_label": "保留名稱",
        "final_target": "管狀海綿（Porifera 類群層級，不指定物種）",
        "summary": "現有紫色管狀外形可作海綿動物的遊戲圖示，但不足以鑑定物種；示例 A. archeri 為加勒比海形態參考，不是香港分布證據。",
        "traits": "海綿具有多孔體表與出水孔；多種海綿都可長成管狀或簇狀，單靠顏色與輪廓通常不能定種。",
        "habitat": "固著於硬底、礁石或其他穩定基質；不同物種分布範圍差異很大。",
        "role": "濾食者，讓水流穿過身體並截取微小顆粒；可作食物鏈中的底棲濾食生物。",
        "hk": "香港海域存在海綿動物類群；現有紫色圖只用作管狀海綿示意，不指定到單一物種。",
        "game": "直接保留現有圖與「管狀海綿」名稱；不加單一物種學名，避免把形態示意誤作物種鑑定。",
        "photo_credit": "Jay Brasher／iNaturalist observation 113024079／CC BY；僅示範管狀外形",
        "photo_url": "https://www.inaturalist.org/observations/113024079",
        "fishbase": "https://www.marinespecies.org/porifera/",
        "worms": "https://www.marinespecies.org/aphia.php?p=taxdetails&id=558",
        "commons": "https://commons.wikimedia.org/wiki/File:Aplysina_archeri_(Stove-pipe_Sponge-pink_variation).jpg",
        "afcd_note": "目前不作物種級香港記錄宣稱；照片僅作形態說明。",
    },
]


for item in species:
    current_target = WORK / f"{item['slug']}_current.jpg"
    real_target = WORK / f"{item['slug']}_real.jpg"
    normalize_image(Path(item["current"]), current_target, mode="contain", background="#F6F3EA")
    normalize_image(Path(item["real"]), real_target, mode="cover", background="#F6F3EA")
    item["current_processed"] = current_target
    item["real_processed"] = real_target


doc = Document()
section = doc.sections[0]
section.page_width = Cm(21.0)
section.page_height = Cm(29.7)
section.top_margin = Cm(1.25)
section.bottom_margin = Cm(1.2)
section.left_margin = Cm(1.35)
section.right_margin = Cm(1.35)
section.header_distance = Cm(0.45)
section.footer_distance = Cm(0.45)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = FONT_CJK
normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)
normal.font.size = Pt(9.3)
normal.font.color.rgb = RGBColor.from_string(INK)
normal.paragraph_format.space_after = Pt(2)
normal.paragraph_format.line_spacing = 1.05
for style_name in ("Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3"):
    style = styles[style_name]
    style.font.name = FONT_CJK
    style._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)

header = section.header
header_p = header.paragraphs[0]
header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
add_text(header_p, "OCEAN BREATHING MISSION  /  BIOLOGICAL MATERIAL REVIEW", size=7.8, bold=True, color=TEAL)
add_bottom_border(header_p, color=TEAL, size=4)
add_page_number(section.footer.paragraphs[0])

# Cover
cover_table = doc.add_table(rows=1, cols=1)
set_table_fixed(cover_table, [10300])
cover_cell = cover_table.cell(0, 0)
cover_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
set_cell_shading(cover_cell, TEAL_DARK)
set_cell_margins(cover_cell, top=800, start=600, bottom=800, end=600)
p = cover_cell.paragraphs[0]
set_paragraph_spacing(p, after=8)
add_text(p, "MATERIAL AUTHENTICITY REVIEW  /  01", size=10, bold=True, color=GOLD)
p = cover_cell.add_paragraph()
set_paragraph_spacing(p, after=12, line=1)
add_text(p, "海洋呼吸任務", size=34, bold=True, color=WHITE)
p = cover_cell.add_paragraph()
set_paragraph_spacing(p, after=24, line=1)
add_text(p, "現有海洋生物素材真實性審查\n與文獻依據", size=23, bold=True, color=WHITE)
p = cover_cell.add_paragraph()
set_paragraph_spacing(p, after=14)
add_text(p, "物種定稿與素材製作依據｜繁體中文｜2026-09-02", size=10.5, color=TEAL_LIGHT)
p = cover_cell.add_paragraph()
set_paragraph_spacing(p, after=0)
add_text(p, "目的：為六種遊戲素材定稿，清楚標示保留、改名或徹底替換；證據不足以定種者保留在類群層級。", size=11.2, color=WHITE)

doc.add_paragraph()
callout = doc.add_table(rows=1, cols=3)
set_table_fixed(callout, [3433, 3433, 3434])
for index, (number, title, text) in enumerate([
    ("02", "保留", "海參、管狀海綿（類群層級）"),
    ("01", "改名", "石斑魚 → 紅斑"),
    ("03", "徹底替換", "雀鯛、銀色魚、鰕虎魚"),
]):
    cell = callout.cell(0, index)
    set_cell_shading(cell, OFFWHITE if index != 2 else GOLD_LIGHT)
    set_cell_margins(cell, top=150, bottom=150)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_text(p, number, size=18, bold=True, color=TEAL)
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_text(p, title, size=9.5, bold=True, color=INK)
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_text(p, text, size=8.6, color=MUTED)

p = doc.add_paragraph()
set_paragraph_spacing(p, before=10, after=2)
add_text(p, "定稿原則", size=11.5, bold=True, color=TEAL_DARK)
p = doc.add_paragraph()
set_paragraph_spacing(p, after=3)
add_text(p, "兼顧教學辨識與科學誠實：辨認特徵足夠者可保留或改名；可作類群圖示但不足以定種者保留類群名稱；辨認特徵明顯不符者徹底替換。魚群照片只表達成群行為，不作物種鑑定。", size=9.6, color=INK)
p = doc.add_paragraph()
set_paragraph_spacing(p, after=0)
add_text(p, "科學資料：香港漁護署、FishBase、WoRMS、同行評審論文。照片：Wikimedia Commons／iNaturalist 的開放授權影像。", size=8.8, color=MUTED)

doc.add_page_break()

# Final decision matrix
add_page_header(doc, "FINAL MATERIAL DECISION", "六種素材最終處理方式", "每項只採用一個明確決定：保留、改名或徹底替換。")
matrix = doc.add_table(rows=1, cols=4)
set_table_fixed(matrix, [1900, 1600, 3800, 3000])
headers = ["現有素材", "最終決定", "最終名稱／替換目標", "素材處理"]
for index, text_value in enumerate(headers):
    cell = matrix.rows[0].cells[index]
    set_cell_shading(cell, TEAL_DARK)
    set_cell_margins(cell, top=110, bottom=110)
    p = cell.paragraphs[0]
    add_text(p, text_value, size=9.2, bold=True, color=WHITE)
set_repeat_table_header(matrix.rows[0])

matrix_rows = [
    ("藍色雀鯛", "徹底替換", "黃尾石剎／斑氏新雀鯛\nNeopomacentrus bankieri", "重繪黃橙尾與藍灰魚身", "F7DEDA"),
    ("銀色礁魚", "徹底替換", "火點／勒氏笛鯛\nLutjanus russellii", "重繪關鍵黑色側斑", "F7DEDA"),
    ("石斑魚", "改名", "紅斑／香港石斑魚\nEpinephelus akaara", "保留現圖，強化紅橙斑點", GOLD_LIGHT),
    ("鰕虎魚", "徹底替換", "深鰕虎魚／褐深鰕虎\nBathygobius fuscus", "重繪褐斑、藍點與貼底姿態", "F7DEDA"),
    ("海參", "保留", "海參\nHolothuroidea 類群層級", "沿用現圖，不指定物種", "DDEDE5"),
    ("管狀海綿", "保留", "管狀海綿\nPorifera 類群層級", "沿用現圖，不指定物種", "DDEDE5"),
]
for row_index, row_data in enumerate(matrix_rows):
    row = matrix.add_row()
    for col_index, value in enumerate(row_data[:4]):
        cell = row.cells[col_index]
        set_cell_shading(cell, row_data[4] if col_index == 1 else (OFFWHITE if row_index % 2 == 0 else WHITE))
        set_cell_margins(cell, top=110, bottom=110)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        add_text(p, value, size=8.6, bold=(col_index in (0, 1)), color=INK)

note = doc.add_table(rows=1, cols=1)
set_table_fixed(note, [10300])
cell = note.cell(0, 0)
set_cell_shading(cell, TEAL_LIGHT)
set_cell_margins(cell, top=150, bottom=150)
p = cell.paragraphs[0]
add_text(p, "定稿結果", size=9.2, bold=True, color=TEAL_DARK)
add_text(p, "　保留 2 項、改名 1 項、徹底替換 3 項。替換目標已在上表與下方資料頁明確列出。", size=9.2, color=INK)

doc.add_page_break()


def add_species_page(item: dict) -> None:
    add_page_header(
        doc,
        f"SPECIES REVIEW  /  {item['number']}",
        item["name_zh"],
        f"{item['name_en']}　｜　{item['scientific']}",
    )
    p = doc.add_paragraph()
    set_paragraph_spacing(p, after=6)
    add_badge(p, item["decision"], item["decision_color"])
    add_text(p, f"　{item['summary']}", size=9.6, color=INK)

    target = doc.add_table(rows=1, cols=1)
    set_table_fixed(target, [10300])
    target_cell = target.cell(0, 0)
    set_cell_shading(target_cell, TEAL_LIGHT if item["decision"] != "徹底替換" else GOLD_LIGHT)
    set_cell_margins(target_cell, top=100, bottom=100)
    p = target_cell.paragraphs[0]
    add_text(p, f"{item['final_label']}　", size=9.2, bold=True, color=TEAL_DARK)
    add_text(p, item["final_target"], size=9.2, bold=True, color=INK)

    image_table = doc.add_table(rows=2, cols=2)
    set_table_fixed(image_table, [5150, 5150])
    if item["decision"] == "徹底替換":
        image_labels = ("現有素材（淘汰）", "替換目標（真實物種）")
    elif item["decision"] == "改名":
        image_labels = ("現有素材（保留）", "改名依據（真實物種）")
    else:
        image_labels = ("現有素材（保留）", "類群／物種比較參考")
    for index, label in enumerate(image_labels):
        cell = image_table.cell(0, index)
        set_cell_shading(cell, TEAL_DARK if index == 0 else TEAL)
        set_cell_margins(cell, top=70, bottom=70)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_text(p, label, size=9.2, bold=True, color=WHITE)
    for index, key in enumerate(("current_processed", "real_processed")):
        cell = image_table.cell(1, index)
        set_cell_shading(cell, OFFWHITE)
        set_cell_margins(cell, top=90, start=90, bottom=90, end=90)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        shape = p.add_run().add_picture(str(item[key]), width=Cm(8.35), height=Cm(4.72))
        alt = (
            f"現有遊戲素材：{item['name_zh']} 的對照圖像"
            if index == 0
            else f"真實參考照片：{item['scientific']} 或管狀海綿形態示例"
        )
        set_alt_text(shape, f"{item['slug']}-{index}", alt)
        if index == 1:
            caption = cell.add_paragraph()
            caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
            set_paragraph_spacing(caption, before=2, after=0)
            add_text(caption, item["photo_credit"], size=7.2, color=MUTED)

    facts = doc.add_table(rows=1, cols=2)
    set_table_fixed(facts, [5150, 5150])
    left = facts.cell(0, 0)
    right = facts.cell(0, 1)
    for cell in (left, right):
        set_cell_shading(cell, WHITE)
        set_cell_margins(cell, top=110, start=140, bottom=110, end=140)
    add_label_value(left, "辨認特徵", item["traits"])
    add_label_value(left, "棲息環境", item["habitat"])
    add_label_value(right, "食物／生態角色", item["role"])
    add_label_value(right, "香港記錄", item["hk"])

    recommendation = doc.add_table(rows=1, cols=1)
    set_table_fixed(recommendation, [10300])
    cell = recommendation.cell(0, 0)
    set_cell_shading(cell, GOLD_LIGHT if item["decision_color"] != GREEN else "DDEDE5")
    set_cell_margins(cell, top=130, bottom=130)
    p = cell.paragraphs[0]
    add_text(p, "最終執行　", size=9.4, bold=True, color=TEAL_DARK)
    add_text(p, item["game"], size=9.3, color=INK)

    p = doc.add_paragraph()
    set_paragraph_spacing(p, before=5, after=1)
    add_text(p, "來源　", size=8.3, bold=True, color=GOLD)
    add_hyperlink(p, "照片", item["photo_url"], size=7.8)
    add_text(p, "　｜　", size=7.8, color=MUTED)
    add_hyperlink(p, "FishBase／論文／類群資料", item["fishbase"], size=7.8)
    add_text(p, "　｜　", size=7.8, color=MUTED)
    add_hyperlink(p, "WoRMS", item["worms"], size=7.8)
    add_text(p, "　｜　", size=7.8, color=MUTED)
    add_hyperlink(p, "Wikimedia Commons", item["commons"], size=7.8)
    p = doc.add_paragraph()
    set_paragraph_spacing(p, after=0)
    add_text(p, item["afcd_note"], size=7.8, color=MUTED)


for index, item in enumerate(species):
    add_species_page(item)
    doc.add_page_break()

# Sources and final implementation list
add_page_header(doc, "SOURCE REGISTER  /  FINAL ACTIONS", "來源、授權與最終落地清單", "科學依據、圖片許可與六項素材的最終處理方式集中列於本頁。")

p = doc.add_paragraph()
set_paragraph_spacing(p, after=4)
add_text(p, "一、核心科學與香港記錄", size=12.5, bold=True, color=TEAL_DARK)
sources = [
    ("香港漁護署：人工魚礁魚類名錄（PDF）", "https://www.afcd.gov.hk/english/fisheries/ar/files/ar_fish_list.pdf"),
    ("香港漁護署：人工魚礁生物資料", "https://www.afcd.gov.hk/english/fisheries/ar/faunas_of_ar.html"),
    ("FishBase：物種辨認、深度、棲地與食性摘要", "https://www.fishbase.se/"),
    ("WoRMS：接受學名與分類地位", "https://www.marinespecies.org/"),
    ("Frontiers 2021：H. leucospilota、沉積物與低氧環境（比較參考）", "https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2021.739657/full"),
    ("香港珊瑚礁普查 2025 結果摘要", "https://www.afcd.gov.hk/english/conservation/con_mar/con_mar_cor/con_mar_cor_hkrc/files/HKRC2025_Results_Summary_Eng.pdf"),
]
for label, url in sources:
    p = doc.add_paragraph(style="List Bullet")
    set_paragraph_spacing(p, after=2)
    add_hyperlink(p, label, url, size=8.8)

p = doc.add_paragraph()
set_paragraph_spacing(p, before=4, after=4)
add_text(p, "二、照片與許可證", size=12.5, bold=True, color=TEAL_DARK)
photo_table = doc.add_table(rows=1, cols=3)
set_table_fixed(photo_table, [3200, 4600, 2500])
for index, label in enumerate(("對象", "攝影者／頁面", "許可證")):
    cell = photo_table.rows[0].cells[index]
    set_cell_shading(cell, TEAL_DARK)
    set_cell_margins(cell, top=90, bottom=90)
    add_text(cell.paragraphs[0], label, size=8.7, bold=True, color=WHITE)
set_repeat_table_header(photo_table.rows[0])
photo_rows = [
    ("N. bankieri", "amfstocker／Commons + iNaturalist", "CC BY 4.0"),
    ("L. russellii", "Donald Davesne／iNaturalist", "CC BY"),
    ("E. akaara", "りなべる／iNaturalist", "CC BY"),
    ("B. fuscus", "coenobita／iNaturalist", "CC BY"),
    ("H. leucospilota（比較參考）", "Ewout Knoester／iNaturalist", "CC BY-SA"),
    ("管狀海綿示例", "Jay Brasher／iNaturalist", "CC BY"),
]
for row_index, row_data in enumerate(photo_rows):
    row = photo_table.add_row()
    for col_index, value in enumerate(row_data):
        cell = row.cells[col_index]
        set_cell_shading(cell, OFFWHITE if row_index % 2 == 0 else WHITE)
        set_cell_margins(cell, top=70, bottom=70)
        add_text(cell.paragraphs[0], value, size=8.1, color=INK, bold=(col_index == 0))

p = doc.add_paragraph()
set_paragraph_spacing(p, before=5, after=2)
add_text(p, "魚群圖片的使用邊界", size=10.5, bold=True, color=TEAL_DARK)
p = doc.add_paragraph()
set_paragraph_spacing(p, after=4)
add_text(p, "Wikimedia Commons 的 Schools of fish 分類可支持「魚群成群出現」的視覺表達，但不能證明畫面中是哪一種魚，也不能單憑一張照片證明種群增減。", size=9.1, color=INK)
add_hyperlink(p, "　查看分類頁", "https://commons.wikimedia.org/wiki/Category:Schools_of_fish", size=8.4)

next_table = doc.add_table(rows=1, cols=3)
set_table_fixed(next_table, [2800, 2800, 4700])
keep = next_table.cell(0, 0)
rename = next_table.cell(0, 1)
replace = next_table.cell(0, 2)
for cell, color in ((keep, "DDEDE5"), (rename, GOLD_LIGHT), (replace, "F7DEDA")):
    set_cell_shading(cell, color)
    set_cell_margins(cell, top=140, bottom=140, start=150, end=150)
p = keep.paragraphs[0]
add_text(p, "保留", size=10.2, bold=True, color=TEAL_DARK)
add_bullet(keep, "管狀海綿", size=8.7)
add_bullet(keep, "海參", size=8.7)
add_bullet(keep, "維持 Porifera／Holothuroidea 類群名稱", size=8.7)
p = rename.paragraphs[0]
add_text(p, "改名", size=10.2, bold=True, color=TEAL_DARK)
add_bullet(rename, "石斑魚 → 紅斑／香港石斑魚", size=8.7)
add_bullet(rename, "Epinephelus akaara", size=8.7)
p = replace.paragraphs[0]
add_text(p, "徹底替換", size=10.2, bold=True, color=TEAL_DARK)
for value in [
    "藍色雀鯛 → Neopomacentrus bankieri",
    "銀色礁魚 → Lutjanus russellii",
    "鰕虎魚 → Bathygobius fuscus",
]:
    add_bullet(replace, value, size=8.5)

p = doc.add_paragraph()
set_paragraph_spacing(p, before=5, after=0)
add_text(p, "結論：六項素材已完成定稿；海參與管狀海綿保留原圖並以類群命名，石斑魚改名，其餘三項依指定真實物種重新製作。", size=9.4, bold=True, color=TEAL_DARK)

# Remove final empty page break paragraph if present.
last_paragraph = doc.paragraphs[-1]
if last_paragraph.text == "" and last_paragraph._p.xpath(".//w:br[@w:type='page']"):
    last_paragraph._element.getparent().remove(last_paragraph._element)

core = doc.core_properties
core.title = "海洋呼吸任務：現有海洋生物素材真實性審查與文獻依據"
core.subject = "六種遊戲海洋生物素材的真實性、香港記錄、照片授權與使用建議"
core.author = "Ocean Education Project"
core.keywords = "海洋教育, 香港海魚, 生物素材, FishBase, WoRMS, AFCD, Wikimedia Commons"
core.comments = "本報告只作內部素材審查；不取代分類專家或正式產品文件。"

for table in doc.tables:
    if table.rows:
        set_repeat_table_header(table.rows[0])

doc.save(OUTPUT)
print(OUTPUT)
