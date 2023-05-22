const { PDFDocument, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const fs = require('fs')
const bwipjs = require('bwip-js')
const drawsvg = require('./drawing-svg')
const { XMLParser } = require('fast-xml-parser')
const XLSX = require('xlsx')
const JSZip = require('jszip')

const start = async function () {
  // open a font synchronously
  const workbook = XLSX.readFile('./files/1.xlsx')
  const ws = workbook.Sheets[workbook.SheetNames[0]]

  let rowNumber = 2
  const dpiScale = 595 / 210
  const shiftX = 8
  const zip = new JSZip()

  while (true) {
    if (typeof (ws['A' + rowNumber]) === 'undefined') break
    const text = [
      ws['A' + rowNumber].v,
      ws['B' + rowNumber].v,
      'Арт. ' + ws['C' + rowNumber].v
    ]
    const subtext = [
      'Производитель: ' + ws['D' + rowNumber].v
    ]

    const fontData = fs.readFileSync('/usr/share/fonts/truetype/msttcorefonts/arial.ttf')
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)
    const customFont = await pdfDoc.embedFont(fontData)

    const page = pdfDoc.addPage([58 * dpiScale, 40 * dpiScale])

    let textSize = 12
    while (true) {
      let sizeOk = true
      for (let i = 0; i < text.length; i++) {
        const line = text[i]
        /* console.log({
          line: line,
          textSize,
          width: customFont.widthOfTextAtSize(line, textSize)
        }) */
        if (customFont.widthOfTextAtSize(line, textSize) > (page.getWidth() - shiftX * 2)) {
          textSize -= 0.5
          sizeOk = false
          break
        }
      }
      if (sizeOk) {
        break
      }
    }
    // console.log(textSize)

    let subtextSize = textSize
    while (true) {
      let sizeOk = true
      for (let i = 0; i < subtext.length; i++) {
        const line = subtext[i]
        /* console.log({
          line: line,
          subtextSize,
          width: customFont.widthOfTextAtSize(line, subtextSize)
        }) */
        if (customFont.widthOfTextAtSize(line, subtextSize) > (page.getWidth() - shiftX * 2)) {
          subtextSize -= 0.5
          sizeOk = false
          break
        }
      }
      if (sizeOk) {
        break
      }
    }

    let shiftY = page.getHeight() - 2
    for (const line of text) {
      shiftY -= customFont.heightAtSize(textSize)

      page.drawText(line, {
        x: shiftX,
        y: shiftY,
        size: textSize,
        font: customFont,
        color: rgb(0, 0, 0)
      })
    }

    shiftY -= customFont.heightAtSize(textSize)

    for (const line of subtext) {
      shiftY -= customFont.heightAtSize(subtextSize)

      page.drawText(line, {
        x: shiftX,
        y: shiftY,
        size: subtextSize,
        font: customFont,
        color: rgb(0, 0, 0)
      })
    }

    shiftY -= customFont.heightAtSize(subtextSize) * 2

    const opts = {
      bcid: 'ean13',
      text: ws['E' + rowNumber].v,
      includetext: true,
      height: shiftY / dpiScale,
      scaleY: 1,
      scaleX: 1
    }

    bwipjs.fixupOptions(opts)

    // The drawing needs FontLib to extract glyph paths.
    const svg = bwipjs.render(opts, drawsvg(opts, bwipjs.FontLib))
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      attributeNamePrefix: '',
      allowBooleanAttributes: true
    })
    const svgParsed = parser.parse(svg)
    // console.log(svgParsed.svg.path)
    for (const p of svgParsed.svg.path) {
      const svgOpt = {
        x: Math.floor((page.getWidth() - svgParsed.svg.width) / 2),
        y: svgParsed.svg.height + 2
      }
      if (typeof (p['stroke-width']) !== 'undefined') {
        const w = p['stroke-width']
        svgOpt.borderWidth = w
        if (w === 2) { svgOpt.x += 1 } else if (w === 4) { svgOpt.x += 1 }
      }
      if (typeof (p.fill) !== 'undefined') { svgOpt.color = rgb(0, 0, 0) }
      page.drawSvgPath(p.d, svgOpt)
      /* console.log({
        color: svgOpt.borderColor,
        d: p.d
      }) */
    }

    const pdfBytes = await pdfDoc.save()

    zip.file(ws['B' + rowNumber].v + ' ' + ws['C' + rowNumber].v + '.pdf', pdfBytes)
    rowNumber++
  }
  const zipBytes = await zip.generateAsync({ type: 'nodebuffer' })
  fs.writeFileSync('./files/1.zip', zipBytes)
}

start()
