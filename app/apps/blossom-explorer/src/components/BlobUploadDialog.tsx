import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useBlossomUpload } from '@/hooks/useBlossomUpload';
import { formatBytes } from '@/lib/formatBytes';

interface BlobUploadDialogProps {
  serverUrl: string;
  onUploadComplete?: () => void;
}

export function BlobUploadDialog({ serverUrl, onUploadComplete }: BlobUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: uploadBlob, isPending, isSuccess, isError, error, reset, data } = useBlossomUpload(serverUrl);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      reset();
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    uploadBlob(selectedFile, {
      onSuccess: () => {
        setTimeout(() => {
          setOpen(false);
          setSelectedFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          reset();
          onUploadComplete?.();
        }, 2000);
      },
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isPending) {
      setOpen(newOpen);
      if (!newOpen) {
        setSelectedFile(null);
        reset();
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  // Parse hostname safely
  let hostname = serverUrl;
  try {
    hostname = new URL(serverUrl).hostname;
  } catch (e) {
    // Keep the original serverUrl if parsing fails
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-pink-600 hover:bg-pink-700">
          <Upload className="h-4 w-4 mr-2" />
          Upload File
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload to Blossom Server</DialogTitle>
          <DialogDescription>
            Upload a file to {hostname}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <Input
              id="file"
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              disabled={isPending}
            />
          </div>

          {selectedFile && (
            <div className="p-3 rounded-lg border bg-muted/50">
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>{formatBytes(selectedFile.size)}</span>
                <span>•</span>
                <span>{selectedFile.type || 'unknown type'}</span>
              </div>
            </div>
          )}

          {isPending && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading...</span>
              </div>
              <Progress value={45} className="h-2" />
            </div>
          )}

          {isSuccess && data && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900 dark:text-green-100">
                File uploaded successfully!
                <p className="font-mono text-xs mt-1 truncate">{data.sha256}</p>
              </AlertDescription>
            </Alert>
          )}

          {isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Upload failed: {error?.message || 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isPending}
              className="bg-pink-600 hover:bg-pink-700"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
