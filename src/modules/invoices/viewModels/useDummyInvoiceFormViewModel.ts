// Dummy Invoice Module - ViewModel
// Fully manual form — no inventory lookup, no serial numbers
// Saves to 'dummy_invoices' Firestore collection

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DummyInvoiceFirebaseService,
  DummyInvoiceProduct,
  DummyInvoiceType,
  generateDummyInvoiceNumber,
} from '../models/DummyInvoiceFirebaseService';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// The stored invoiceType value is still 'Dummy' (unchanged, so existing saved
// invoices keep working) — only the text shown to the user in toasts below
// reads "Fictitious", matching the rename used across this module's UI.
function invoiceTypeDisplayLabel(t: DummyInvoiceType): string {
  return t === 'Dummy' ? 'Fictitious' : t;
}

function emptyProduct(): DummyInvoiceProduct {
  return { id: uid(), productName: '', description: '', quantity: 1, unitPrice: 0, total: 0 };
}

// Firestore documents cap out at 1MiB, and a phone photo's base64 can easily
// blow past that on its own — so every attached image is downscaled and
// re-encoded as JPEG before it's ever stored. This keeps a typical photo
// comfortably under ~150KB (well inside the doc limit, with room for
// everything else on the invoice) without a Storage bucket to manage.
const ATTACHMENT_MAX_DIM = 1280;
const ATTACHMENT_JPEG_QUALITY = 0.82;

function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > ATTACHMENT_MAX_DIM || height > ATTACHMENT_MAX_DIM) {
          const scale = ATTACHMENT_MAX_DIM / Math.max(width, height);
          width  = Math.round(width  * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        // White backdrop first — a transparent PNG re-encoded as JPEG would
        // otherwise turn its transparent areas black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', ATTACHMENT_JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export interface UseDummyInvoiceFormViewModelReturn {
  invoiceType:    DummyInvoiceType;
  setInvoiceType: (t: DummyInvoiceType) => void;
  invoiceNumber:  string;
  setInvoiceNumber: (n: string) => void;
  date:           string;
  setDate:        (d: string) => void;
  validUntil:     string;
  setValidUntil:  (d: string) => void;
  // Customer
  customerName:    string; setCustomerName:    (v: string) => void;
  customerPhone:   string; setCustomerPhone:   (v: string) => void;
  customerPhone2:  string; setCustomerPhone2:  (v: string) => void;
  customerCNIC:    string; setCustomerCNIC:    (v: string) => void;
  customerCity:    string; setCustomerCity:    (v: string) => void;
  customerProvince:string; setCustomerProvince:(v: string) => void;
  customerAddress: string; setCustomerAddress: (v: string) => void;
  // Products
  products:      DummyInvoiceProduct[];
  addProduct:    () => void;
  removeProduct: (id: string) => void;
  updateProduct: (id: string, field: keyof DummyInvoiceProduct, value: any) => void;
  totalAmount:   number;
  // Sales
  salesperson:    string; setSalesperson:    (v: string) => void;
  notes:          string; setNotes:          (v: string) => void;
  status:         string; setStatus:         (v: string) => void;
  // Saved salespersons for autocomplete
  savedSalespersons: string[];
  // Attachment + digital stamp
  imageDataUrl:     string | null;
  isUploadingImage: boolean;
  handleImageUpload: (file: File) => Promise<void>;
  removeImage:       () => void;
  digitalStamp:      boolean;
  setDigitalStamp:   (v: boolean) => void;
  // Meta
  isEditing:  boolean;
  isSaving:   boolean;
  isLoading:  boolean;
  handleSave:   () => Promise<void>;
  handleCancel: () => void;
}

export function useDummyInvoiceFormViewModel(): UseDummyInvoiceFormViewModelReturn {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();
  const isEditing = !!id;

  const [invoiceType,    setInvoiceTypeState] = useState<DummyInvoiceType>('Dummy');
  const [invoiceNumber,  setInvoiceNumber]    = useState('');
  const [date,           setDate]             = useState(new Date().toLocaleDateString('en-CA'));
  const [validUntil,     setValidUntil]       = useState('');
  const [customerName,   setCustomerName]     = useState('');
  const [customerPhone,  setCustomerPhone]    = useState('');
  const [customerPhone2, setCustomerPhone2]   = useState('');
  const [customerCNIC,   setCustomerCNIC]     = useState('');
  const [customerCity,   setCustomerCity]     = useState('');
  const [customerProvince, setCustomerProvince] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [products,       setProducts]         = useState<DummyInvoiceProduct[]>([emptyProduct()]);
  const [salesperson,    setSalesperson]      = useState('');
  const [notes,          setNotes]            = useState('');
  const [status,         setStatus]           = useState('Draft');
  const [savedSalespersons, setSavedSalespersons] = useState<string[]>([]);
  const [isSaving,       setIsSaving]         = useState(false);
  const [isLoading,      setIsLoading]        = useState(false);
  const [imageDataUrl,     setImageDataUrl]     = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [digitalStamp,     setDigitalStamp]     = useState(false);

  const totalAmount = products.reduce((s, p) => s + (p.total || 0), 0);

  // Load saved salespersons
  useEffect(() => {
    getDocs(query(collection(db, 'salespersons'), orderBy('name')))
      .then(snap => setSavedSalespersons(snap.docs.map(d => (d.data() as any).name || d.id)))
      .catch(() => {});
  }, []);

  // Generate invoice number when type changes (or on mount)
  const setInvoiceType = useCallback(async (t: DummyInvoiceType) => {
    setInvoiceTypeState(t);
    if (!isEditing) {
      const num = await generateDummyInvoiceNumber(t).catch(() => `${t.slice(0, 3).toUpperCase()}-DRAFT`);
      setInvoiceNumber(num);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      generateDummyInvoiceNumber('Dummy')
        .then(setInvoiceNumber)
        .catch(() => setInvoiceNumber('DUM-DRAFT'));
    }
  }, [isEditing]);

  // Load existing for edit
  useEffect(() => {
    if (!isEditing || !id) return;
    setIsLoading(true);
    DummyInvoiceFirebaseService.fetchById(id)
      .then(inv => {
        if (!inv) { toast.error('Invoice not found'); navigate('/invoices/dummy'); return; }
        setInvoiceTypeState(inv.invoiceType);
        setInvoiceNumber(inv.invoiceNumber);
        setDate(inv.date);
        setValidUntil(inv.validUntil || '');
        setCustomerName(inv.customerName);
        setCustomerPhone(inv.customerPhone);
        setCustomerPhone2(inv.customerPhone2 || '');
        setCustomerCNIC(inv.customerCNIC || '');
        setCustomerCity(inv.customerCity || '');
        setCustomerProvince(inv.customerProvince || '');
        setCustomerAddress(inv.customerAddress || '');
        setProducts(inv.products);
        setSalesperson(inv.salesperson || '');
        setNotes(inv.notes || '');
        setStatus(inv.status);
        setImageDataUrl(inv.imageDataUrl || null);
        setDigitalStamp(!!inv.digitalStamp);
      })
      .finally(() => setIsLoading(false));
  }, [id, isEditing, navigate]);

  const handleImageUpload = useCallback(async (file: File) => {
    setIsUploadingImage(true);
    try {
      const resized = await resizeImageFile(file);
      setImageDataUrl(resized);
    } catch (err: any) {
      toast.error(err?.message || 'Could not attach that image');
    } finally {
      setIsUploadingImage(false);
    }
  }, []);

  const removeImage = useCallback(() => setImageDataUrl(null), []);

  const addProduct = useCallback(() => setProducts(p => [...p, emptyProduct()]), []);

  const removeProduct = useCallback((pid: string) =>
    setProducts(p => p.filter(x => x.id !== pid)), []);

  const updateProduct = useCallback((pid: string, field: keyof DummyInvoiceProduct, value: any) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== pid) return p;
      const updated = { ...p, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        updated.total = (field === 'quantity' ? Number(value) : updated.quantity)
          * (field === 'unitPrice' ? Number(value) : updated.unitPrice);
      }
      return updated;
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!customerName.trim()) {
      toast.error('Customer name is required');
      alert('Customer name is required');
      return;
    }
    if (products.length === 0 || !products.some(p => p.productName.trim())) {
      toast.error('Add at least one product');
      alert('Add at least one product with a name');
      return;
    }
    setIsSaving(true);
    try {
      const validProducts = products.filter(p => p.productName.trim());
      const payload = {
        invoiceType,
        invoiceNumber,
        date,
        validUntil: validUntil || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerPhone2: customerPhone2 || undefined,
        customerCNIC:   customerCNIC   || undefined,
        customerCity:   customerCity   || undefined,
        customerProvince: customerProvince || undefined,
        customerAddress:  customerAddress  || undefined,
        products: validProducts,
        totalAmount,
        salesperson: salesperson || undefined,
        notes:       notes       || undefined,
        status:      status as any,
        imageDataUrl: imageDataUrl || undefined,
        digitalStamp,
        createdAt:   new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      };

      console.log('[DummyInvoice] Saving payload:', payload);

      // Strip undefined — Firestore rejects undefined field values
      const clean = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined)
      ) as any;

      if (isEditing && id) {
        await DummyInvoiceFirebaseService.update(id, clean);
        toast.success(`${invoiceTypeDisplayLabel(invoiceType)} invoice updated`);
      } else {
        const saved = await DummyInvoiceFirebaseService.create(clean);
        console.log('[DummyInvoice] Saved:', saved);
        toast.success(`${invoiceTypeDisplayLabel(invoiceType)} invoice saved — ${invoiceNumber}`);
      }
      navigate('/invoices/dummy');
    } catch (err: any) {
      console.error('[DummyInvoice] Save error:', err);
      toast.error(err?.message || 'Failed to save');
      alert(`Save failed: ${err?.message || 'Unknown error — check console'}`);
    } finally {
      setIsSaving(false);
    }
  }, [invoiceType, invoiceNumber, date, validUntil, customerName, customerPhone,
      customerPhone2, customerCNIC, customerCity, customerProvince, customerAddress,
      products, totalAmount, salesperson, notes, status, imageDataUrl, digitalStamp,
      isEditing, id, navigate]);

  const handleCancel = useCallback(() => navigate('/invoices/dummy'), [navigate]);

  return {
    invoiceType, setInvoiceType,
    invoiceNumber, setInvoiceNumber,
    date, setDate,
    validUntil, setValidUntil,
    customerName, setCustomerName,
    customerPhone, setCustomerPhone,
    customerPhone2, setCustomerPhone2,
    customerCNIC, setCustomerCNIC,
    customerCity, setCustomerCity,
    customerProvince, setCustomerProvince,
    customerAddress, setCustomerAddress,
    products, addProduct, removeProduct, updateProduct,
    totalAmount,
    salesperson, setSalesperson,
    notes, setNotes,
    status, setStatus,
    savedSalespersons,
    imageDataUrl, isUploadingImage, handleImageUpload, removeImage,
    digitalStamp, setDigitalStamp,
    isEditing, isSaving, isLoading,
    handleSave, handleCancel,
  };
}