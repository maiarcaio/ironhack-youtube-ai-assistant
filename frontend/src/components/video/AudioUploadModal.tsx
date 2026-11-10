import { useRef, useState } from 'react'
import { validateAudioUploadFile } from '../../services/api/audioUpload'

interface Props { isOpen: boolean; isSubmitting: boolean; isMockMode: boolean; error: string | null; onClose: () => void; onUpload: (file: File) => Promise<boolean>; onRefreshLibrary?: () => void }

export function AudioUploadModal({ isOpen, isSubmitting, isMockMode, error, onClose, onUpload, onRefreshLibrary }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  function closeDialog(): void {
    if (isSubmitting) return
    setFile(null)
    setValidationError(null)
    if (inputRef.current) inputRef.current.value = ''
    onClose()
  }
  if (!isOpen) return null
  const message = validationError ?? error
  return <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="presentation"><section className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#ede7e1]" role="dialog" aria-modal="true" aria-labelledby="upload-audio-title"><div className="flex items-center justify-between mb-5"><div><h2 id="upload-audio-title" className="text-base font-bold">Upload Audio</h2><p className="text-xs text-[#615e5c]">MP3, WAV, or M4A · maximum 24 MB</p></div><button type="button" onClick={closeDialog} disabled={isSubmitting} aria-label="Close audio upload dialog">×</button></div>{isMockMode ? <p role="status" className="p-3 rounded-xl bg-[#f7f3f0] text-xs">Audio upload is unavailable in demo mode.</p> : <form onSubmit={(event) => { event.preventDefault(); if (file && !isSubmitting) void onUpload(file).then((succeeded) => { if (succeeded) { setFile(null); setValidationError(null); if (inputRef.current) inputRef.current.value = '' } }) }} className="space-y-4">{message && <div className="space-y-2"><p role="alert" className="p-3 rounded-xl bg-[#ffdad6] text-xs text-[#93000a]">{message}</p>{onRefreshLibrary && <button type="button" onClick={onRefreshLibrary} disabled={isSubmitting} className="text-xs font-semibold text-[#9a442d] underline">Refresh library</button>}</div>}<input ref={inputRef} className="sr-only" type="file" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4" onChange={(event) => { const selected = event.target.files?.[0] ?? null; try { if (selected) validateAudioUploadFile(selected); setFile(selected); setValidationError(null) } catch (caught) { setFile(null); setValidationError(caught instanceof Error ? caught.message : 'Choose a supported audio file.') } }} /><button type="button" onClick={() => inputRef.current?.click()} disabled={isSubmitting} className="w-full p-5 rounded-xl border border-dashed border-[#dbc1ba] text-xs font-semibold">{file ? file.name : 'Choose audio file'}</button>{file && <p className="text-xs text-[#88726d]">{Math.ceil(file.size / 1024)} KB selected</p>}<div className="flex justify-end gap-3"><button type="button" onClick={closeDialog} disabled={isSubmitting} className="px-4 py-2 text-xs">Cancel</button><button type="submit" disabled={!file || isSubmitting} className="px-5 py-2.5 rounded-xl bg-[#9a442d] text-white text-xs font-semibold disabled:opacity-40">{isSubmitting ? 'Uploading…' : 'Upload audio'}</button></div></form>}</section></div>
}
