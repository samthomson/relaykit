const MAX_DIMENSION = 2048
const QUALITY = 0.8
const MAX_SIZE_BYTES = 1_000_000

export const compressImage = (file: File): Promise<File> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file)
      return
    }

    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file)
            return
          }
          const ext = file.type === 'image/png' ? '.png' : '.jpg'
          const name = file.name.replace(/\.[^.]+$/, '') + ext
          resolve(new File([blob], name, { type: blob.type }))
        },
        file.size > MAX_SIZE_BYTES ? 'image/jpeg' : file.type,
        QUALITY,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('failed to load image'))
    }

    img.src = url
  })
