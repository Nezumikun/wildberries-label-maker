const express = require('express')
const router = express.Router()
const formidable = require('formidable')
const XLSX = require('xlsx')
const fs = require('fs')
const { PDFDocument, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const bwipjs = require('bwip-js')
const drawsvg = require('../drawing-svg')
const { XMLParser } = require('fast-xml-parser')
const contentDisposition = require('content-disposition')
const dayjs = require('dayjs')
const JSZip = require('jszip')
const { scale } = require('scale-that-svg')

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { })
})

router.get('/healthcheck', function (req, res, next) {
  res.end('Ok')
})

const parseXLSX = async function (data) {
  // open a font synchronously
  const workbook = XLSX.read(data)
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  let rowNumber = 2
  const result = []
  while (true) {
    if (typeof (ws['A' + rowNumber]) === 'undefined') break
    const item = {
      russianName: (ws['A' + rowNumber] ?? {}).v ?? '',
      englishName: (ws['B' + rowNumber] ?? {}).v ?? '',
      color: (ws['C' + rowNumber] ?? {}).v ?? '',
      articleNumber: (ws['D' + rowNumber] ?? {}).v ?? '',
      size: (ws['E' + rowNumber] ?? {}).v ?? '',
      manufacturer: (ws['F' + rowNumber] ?? {}).v ?? '',
      structure: (ws['G' + rowNumber] ?? {}).v ?? '',
      barcode: ws['H' + rowNumber].v + ''
    }
    item.text = []
    item.subtext = []
    const russianNameLines = item.russianName.split(/[\n\r]+/g)
    if (item.englishName !== '') {
      russianNameLines[russianNameLines.length - 1] += ' /'
    }
    item.text = item.text.concat(russianNameLines)
    const englishNameLines = item.englishName.split(/[\n\r]+/g)
    if (item.englishName !== '') {
      item.text = item.text.concat(englishNameLines)
    }
    if (item.size !== '') {
      item.subtext.push('Размер: ' + item.size)
    }
    if (item.color !== '') {
      item.subtext.push('Цвет: ' + item.color)
    }
    if (item.articleNumber !== '') {
      item.subtext.push('Арт. ' + item.articleNumber)
    }
    if (item.structure !== '') {
      item.subtext.push('Состав: ' + item.structure)
    }
    if (item.manufacturer !== '') {
      item.subtext.push('Бренд: ' + item.manufacturer)
    }
    result.push(item)
    rowNumber++
  }
  return result
}

const getFileName = function (data) {
  let name = (data.englishName !== '') ? data.englishName : data.russianName
  if (data.articleNumber !== '') {
    name += (name.length > 0) ? ' ' : ''
    name += data.articleNumber
  }
  if (data.size !== '') {
    name += (name.length > 0) ? ' ' : ''
    name += data.size
  }
  name += '.pdf'
  return name
}

const createPdf = async function (data) {
  const dpiScale = 595 / 210
  const shiftX = 8
  const fontData = fs.readFileSync('./files/font.ttf')
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const customFont = await pdfDoc.embedFont(fontData)

  const page = pdfDoc.addPage([data.page.size.width * dpiScale, data.page.size.height * dpiScale])

  let textSize = 11
  while (true) {
    let sizeOk = true
    for (let i = 0; i < data.text.length; i++) {
      const line = data.text[i]
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

  let subtextSize = textSize - 2
  while (true) {
    let sizeOk = true
    for (let i = 0; i < data.subtext.length; i++) {
      const line = data.subtext[i]
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
  for (const line of data.text) {
    shiftY -= customFont.heightAtSize(textSize)
    page.drawText(line, {
      x: shiftX,
      y: shiftY,
      size: textSize,
      font: customFont,
      color: rgb(0, 0, 0)
    })
  }

  shiftY -= customFont.heightAtSize(textSize) / 3
  for (const line of data.subtext) {
    shiftY -= customFont.heightAtSize(subtextSize)
    page.drawText(line, {
      x: shiftX,
      y: shiftY,
      size: subtextSize,
      font: customFont,
      color: rgb(0, 0, 0)
    })
  }

  shiftY -= customFont.heightAtSize(subtextSize)
  const opts = {
    bcid: 'ean13',
    text: data.barcode,
    includetext: true,
    height: shiftY / dpiScale,
    scaleY: 1,
    scaleX: 1
  }
  bwipjs.fixupOptions(opts)
  const svg = bwipjs.render(opts, drawsvg(opts, bwipjs.FontLib))
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    attributeNamePrefix: '',
    allowBooleanAttributes: true
  })
  let svgParsed = parser.parse(svg)
  if ((page.getWidth() - shiftX * 2) < svgParsed.svg.width) {
    const scaleX = (page.getWidth() - shiftX * 2) / svgParsed.svg.width
    const rescale = await new Promise((resolve, reject) => {
      scale(svg, {
        scale: scaleX
      }).then((scaledFromString) => resolve(scaledFromString))
    })
    svgParsed = parser.parse(rescale)
    svgParsed.svg.width *= scaleX
  }
  let minw = 0
  for (const p of svgParsed.svg.path) {
    if (typeof (p['stroke-width']) !== 'undefined') {
      const w = p['stroke-width']
      if (minw === 0 || minw > w) {
        minw = w
      }
    }
  }
  for (const p of svgParsed.svg.path) {
    const svgOpt = {
      x: Math.floor((page.getWidth() - svgParsed.svg.width) / 2),
      y: svgParsed.svg.height + 2
    }
    if (typeof (p['stroke-width']) !== 'undefined') {
      const w = Math.floor(p['stroke-width'] / minw)
      svgOpt.borderWidth = p['stroke-width']
      if (w === 2) { svgOpt.x += minw } else if (w === 4) { svgOpt.x += minw }
    }
    if (typeof (p.fill) !== 'undefined') { svgOpt.color = rgb(0, 0, 0) }
    page.drawSvgPath(p.d, svgOpt)
  }
  return {
    filename: getFileName(data),
    data: await pdfDoc.save()
  }
}

const createZip = async function (data) {
  const zip = new JSZip()
  for (const file of data) {
    zip.file(file.filename, file.data)
  }
  const zipBytes = await zip.generateAsync({ type: 'nodebuffer' })
  return zipBytes
}

router.post('/', async function (req, res, next) {
  try {
    const form = formidable({ multiples: true })
    const parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err)
          return
        }
        resolve({
          files,
          fields
        })
      })
    })
    const page = {
      size: {
        width: parsed.fields.page_width,
        height: parsed.fields.page_height
      }
    }
    const xlsxBytes = fs.readFileSync(parsed.files.file.filepath)
    const labels = await parseXLSX(xlsxBytes)
    const pdfFiles = []
    for (const label of labels) {
      label.page = page
      pdfFiles.push(await createPdf(label))
    }
    if (pdfFiles.length === 1) {
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(pdfFiles[0].filename)
      })
      res.write(Buffer.from(pdfFiles[0].data))
      res.end()
    } else if (pdfFiles.length > 1) {
      const zip = await createZip(pdfFiles)
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition(dayjs().format('YYYYMMDD_HHmmss') + '.zip')
      })
      res.write(Buffer.from(zip.buffer))
      res.end()
    } else {
      res.render('index', { })
    }
  } catch (err) {
    res.render('index', { err })
  }
})

module.exports = router
