import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Eye, 
  Download, 
  Copy, 
  CheckCircle2, 
  ExternalLink,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  File
} from 'lucide-react';
import { formatBytes } from '@/lib/formatBytes';
import { formatDistance } from 'date-fns';
import { useToast } from '@/hooks/useToast';

interface BlobDetailDialogProps {
  blob: {
    sha256: string;
    url?: string;
    size?: number;
    type?: string;
    uploaded?: number;
  };
  children?: React.ReactNode;
}

export function BlobDetailDialog({ blob, children }: BlobDetailDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      description: (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>{label} copied to clipboard</span>
        </div>
      ),
    });
  };

  const getFileIcon = (type?: string) => {
    if (!type) return <File className="h-12 w-12 text-muted-foreground" />;
    if (type.startsWith('image/')) return <ImageIcon className="h-12 w-12 text-blue-600" />;
    if (type.startsWith('video/')) return <Video className="h-12 w-12 text-purple-600" />;
    if (type.startsWith('audio/')) return <Music className="h-12 w-12 text-green-600" />;
    if (type.includes('text') || type.includes('pdf')) return <FileText className="h-12 w-12 text-orange-600" />;
    return <File className="h-12 w-12 text-muted-foreground" />;
  };

  const renderPreview = () => {
    if (!blob.url || !blob.type) return null;

    if (blob.type.startsWith('image/')) {
      return (
        <div className="rounded-lg border overflow-hidden bg-muted/50">
          <img 
            src={blob.url} 
            alt="Blob preview" 
            className="w-full h-auto max-h-96 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      );
    }

    if (blob.type.startsWith('video/')) {
      return (
        <div className="rounded-lg border overflow-hidden bg-muted/50">
          <video 
            src={blob.url} 
            controls 
            className="w-full h-auto max-h-96"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      );
    }

    if (blob.type.startsWith('audio/')) {
      return (
        <div className="rounded-lg border p-4 bg-muted/50">
          <audio 
            src={blob.url} 
            controls 
            className="w-full"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm">
            <Eye className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Blob Details</DialogTitle>
          <DialogDescription>
            View information and preview for this blob
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Icon and Type */}
          <div className="flex items-center gap-4">
            {getFileIcon(blob.type)}
            <div className="flex-1">
              <Badge variant="outline" className="mb-2">
                {blob.type || 'Unknown type'}
              </Badge>
              {blob.size && (
                <p className="text-sm text-muted-foreground">
                  {formatBytes(blob.size)}
                </p>
              )}
              {blob.uploaded && (
                <p className="text-xs text-muted-foreground mt-1">
                  Uploaded {formatDistance(new Date(blob.uploaded * 1000), new Date(), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>

          {/* Preview */}
          {renderPreview()}

          {/* SHA-256 Hash */}
          <div className="space-y-2">
            <label className="text-sm font-medium">SHA-256 Hash</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 rounded-md bg-muted text-xs font-mono break-all">
                {blob.sha256}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(blob.sha256, 'Hash')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* URL */}
          {blob.url && (
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 rounded-md bg-muted text-xs font-mono break-all">
                  {blob.url}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(blob.url!, 'URL')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {blob.url && (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(blob.url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in New Tab
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  asChild
                >
                  <a href={blob.url} download>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
