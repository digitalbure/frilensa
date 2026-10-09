import React, { useState, useRef } from 'react';
import { 
  Paperclip, Upload, Camera, FileText, Image as ImageIcon, 
  Trash2, Eye, Download, X, Plus, AlertCircle, CheckCircle2,
  FileSpreadsheet, ExternalLink, RefreshCw
} from 'lucide-react';
import { PaymentAttachment } from '../types';

interface PaymentAttachmentWidgetProps {
  attachments: PaymentAttachment[];
  onChange: (attachments: PaymentAttachment[]) => void;
  readOnly?: boolean;
  title?: string;
  description?: string;
  allowCamera?: boolean;
  maxFiles?: number;
  maxSizeMb?: number;
}

export default function PaymentAttachmentWidget({
  attachments = [],
  onChange,
  readOnly = false,
  title = "Payment Records & Proof Attachments",
  description = "Attach wire transfer slips, M-Paisa screenshots, bank confirmations, or remittance advice.",
  allowCamera = true,
  maxFiles = 10,
  maxSizeMb = 12
}: PaymentAttachmentWidgetProps) {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PaymentAttachment | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [captionInput, setCaptionInput] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // File processing helper
  const handleFiles = (files: FileList | File[]) => {
    setErrorMsg(null);
    const fileArray = Array.from(files);

    if (attachments.length + fileArray.length > maxFiles) {
      setErrorMsg(`Maximum ${maxFiles} payment records allowed.`);
      return;
    }

    fileArray.forEach(file => {
      // Validate file size
      if (file.size > maxSizeMb * 1024 * 1024) {
        setErrorMsg(`File "${file.name}" exceeds the ${maxSizeMb}MB limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const newAttachment: PaymentAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: base64,
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'User',
          caption: file.name.replace(/\.[^/.]+$/, '')
        };

        onChange([...attachments, newAttachment]);
      };
      reader.onerror = () => {
        setErrorMsg(`Failed to read file ${file.name}.`);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (readOnly) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChange(attachments.filter(a => a.id !== id));
    if (previewItem?.id === id) {
      setPreviewItem(null);
    }
  };

  const handleSaveCaption = (id: string) => {
    onChange(attachments.map(a => a.id === id ? { ...a, caption: captionInput.trim() || a.name } : a));
    setEditingCaptionId(null);
    setCaptionInput('');
  };

  // Camera integration
  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser. Please use manual upload.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'Unable to access device camera.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    stopCamera();

    const newAttachment: PaymentAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: `Payment-Slip-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-4)}.jpg`,
      type: 'image/jpeg',
      size: Math.round((dataUrl.length * 3) / 4),
      dataUrl: dataUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Camera Snapshot',
      caption: 'Direct Camera Payment Proof'
    };

    onChange([...attachments, newAttachment]);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (att: PaymentAttachment) => {
    return att.type.startsWith('image/') || att.dataUrl.startsWith('data:image/');
  };

  const isPdf = (att: PaymentAttachment) => {
    return att.type.includes('pdf') || att.name.toLowerCase().endsWith('.pdf') || att.dataUrl.startsWith('data:application/pdf');
  };

  return (
    <div id="payment-attachment-widget" className="space-y-3">
      {/* Widget Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-slate-800 font-extrabold text-xs">
            <Paperclip className="w-3.5 h-3.5 text-sky-600" />
            <span>{title}</span>
            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.2 rounded-full font-mono">
              {attachments.length} {attachments.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          {description && (
            <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1.5">
            {allowCamera && !isCameraActive && (
              <button
                type="button"
                onClick={() => startCamera('environment')}
                className="bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold px-2.5 py-1 rounded-lg text-[10px] transition-all flex items-center gap-1 cursor-pointer"
                title="Capture receipt using camera"
              >
                <Camera className="w-3 h-3" />
                <span>Snap Proof</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-all flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Upload className="w-3 h-3" />
              <span>Upload Record</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx,.csv"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Camera Live Viewfinder if open */}
      {isCameraActive && (
        <div className="bg-slate-950 rounded-2xl p-3 text-white space-y-2 relative overflow-hidden border border-slate-800">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
            <span className="font-bold flex items-center gap-1.5 text-sky-400">
              <Camera className="w-3.5 h-3.5 animate-pulse" /> Live Camera Payment Record Capture
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = facingMode === 'environment' ? 'user' : 'environment';
                  setFacingMode(next);
                  startCamera(next);
                }}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Flip
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="text-[10px] bg-rose-900/60 hover:bg-rose-800 text-rose-200 px-2 py-0.5 rounded cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex items-center justify-center pt-1">
            <button
              type="button"
              onClick={capturePhoto}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> Capture Payment Slip
            </button>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" /> {errorMsg}
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Drag & Drop Zone (when empty or when dragging) */}
      {!readOnly && attachments.length === 0 && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-sky-500 bg-sky-50/80 scale-[1.01]'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <div className="w-10 h-10 rounded-2xl bg-white shadow-2xs border border-slate-200 mx-auto flex items-center justify-center text-slate-500 mb-2">
            <Upload className="w-5 h-5 text-sky-600" />
          </div>
          <p className="text-xs font-bold text-slate-800">
            Drag & drop payment slips, receipts, or screenshots here
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Supports Images (JPG, PNG), PDF documents, Bank TT slips (up to {maxSizeMb}MB)
          </p>
          <div className="mt-2.5 flex items-center justify-center gap-2">
            <span className="text-[9.5px] font-bold text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded-md">
              M-Paisa SMS / Transfer Proof
            </span>
            <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
              Bank TT Slip / Wire Receipt
            </span>
          </div>
        </div>
      )}

      {/* Attachments List / Grid */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {attachments.map((att) => {
              const image = isImage(att);
              const pdf = isPdf(att);

              return (
                <div
                  key={att.id}
                  className="bg-white rounded-xl border border-slate-200/90 p-2.5 flex items-start gap-2.5 hover:border-slate-300 transition-all shadow-2xs group relative"
                >
                  {/* Thumbnail / Icon */}
                  {image ? (
                    <div
                      onClick={() => setPreviewItem(att)}
                      className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 shrink-0 cursor-pointer relative group/thumb"
                    >
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setPreviewItem(att)}
                      className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 cursor-pointer border ${
                        pdf 
                          ? 'bg-rose-50 border-rose-200 text-rose-600' 
                          : 'bg-sky-50 border-sky-200 text-sky-600'
                      }`}
                    >
                      {pdf ? <FileText className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex-1 min-w-0 pr-1">
                    {editingCaptionId === att.id ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={captionInput}
                          onChange={(e) => setCaptionInput(e.target.value)}
                          placeholder="Attachment label / reference..."
                          className="w-full text-xs font-bold bg-white border border-sky-400 rounded px-1.5 py-0.5 focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCaption(att.id);
                            if (e.key === 'Escape') setEditingCaptionId(null);
                          }}
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleSaveCaption(att.id)}
                            className="text-[9px] bg-sky-600 text-white font-bold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCaptionId(null)}
                            className="text-[9px] text-slate-500 hover:text-slate-700 px-1 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h5 
                          onClick={() => setPreviewItem(att)}
                          className="text-xs font-bold text-slate-900 truncate hover:text-sky-600 cursor-pointer" 
                          title={att.caption || att.name}
                        >
                          {att.caption || att.name}
                        </h5>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {att.name} {att.size ? `• ${formatFileSize(att.size)}` : ''}
                        </p>
                      </>
                    )}

                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-mono mt-0.5">
                      <span>{new Date(att.uploadedAt).toLocaleDateString()}</span>
                      {att.uploadedBy && <span>• {att.uploadedBy}</span>}
                    </div>
                  </div>

                  {/* Item Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(att)}
                      className="p-1 rounded text-slate-400 hover:text-sky-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="View file"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={att.dataUrl}
                      download={att.name}
                      className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Download record"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => handleRemove(att.id, e)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remove attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!readOnly && attachments.length < maxFiles && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add another payment record
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lightbox / Document Preview Modal */}
      {previewItem && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewItem(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl overflow-hidden flex flex-col text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-white/10">
                  <Paperclip className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white truncate max-w-xs sm:max-w-md">
                    {previewItem.caption || previewItem.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {previewItem.name} • {formatFileSize(previewItem.size)} • Uploaded {new Date(previewItem.uploadedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewItem.dataUrl}
                  download={previewItem.name}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center bg-slate-50 min-h-[300px]">
              {isImage(previewItem) ? (
                <img
                  src={previewItem.dataUrl}
                  alt={previewItem.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : isPdf(previewItem) ? (
                <div className="w-full h-[65vh] flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 p-6 text-center">
                  <FileText className="w-16 h-16 text-rose-500 mb-3" />
                  <h5 className="font-bold text-slate-800 text-sm mb-1">{previewItem.name}</h5>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    PDF Document preview. You can open it in a new window or download it for your records.
                  </p>
                  <div className="flex gap-2">
                    <a
                      href={previewItem.dataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open in New Tab
                    </a>
                    <a
                      href={previewItem.dataUrl}
                      download={previewItem.name}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Download PDF
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 bg-white rounded-xl border border-slate-200">
                  <FileSpreadsheet className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700 mb-1">{previewItem.name}</p>
                  <p className="text-[10px] text-slate-400 mb-3">{previewItem.type || 'Document file'}</p>
                  <a
                    href={previewItem.dataUrl}
                    download={previewItem.name}
                    className="bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Document
                  </a>
                </div>
              )}
            </div>

            {/* Preview Footer */}
            <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>{previewItem.caption ? `Label: "${previewItem.caption}"` : 'Official payment settlement attachment'}</span>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-1.5 rounded-lg text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
