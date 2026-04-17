import { useSeoMeta } from '@unhead/react';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBlossomList } from '@/hooks/useBlossomList';
import { BlobDetailDialog } from '@/components/BlobDetailDialog';
import { 
  Database, 
  HardDrive,
  Clock, 
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  FileIcon,
  AlertCircle,
  Download,
  RefreshCw
} from 'lucide-react';
import { formatBytes } from '@/lib/formatBytes';
import { formatDistance } from 'date-fns';

const Index = () => {
  useSeoMeta({
    title: 'Blossom Explorer',
    description: 'Browse files on Blossom servers.',
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [serverUrl, setServerUrl] = useState(searchParams.get('server') || 'https://bs.samt.st');
  const [pubkey, setPubkey] = useState(searchParams.get('pubkey') || '2093baa8621c5b255e8f4fc2c6fdfc10d8a5598a25517664efaba860735f1030');

  const { data: blobs, isLoading: blobsLoading, error: blobsError, refetch } = useBlossomList(
    serverUrl,
    pubkey
  );

  // Sort by newest first
  const sortedBlobs = blobs ? [...blobs].sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0)) : [];

  useEffect(() => {
    const params: Record<string, string> = {};
    if (serverUrl) params.server = serverUrl;
    if (pubkey) params.pubkey = pubkey;
    setSearchParams(params);
  }, [serverUrl, pubkey, setSearchParams]);

  const totalSize = blobs?.reduce((acc, b) => acc + (b.size || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Server and Pubkey Input */}
        <div className="mb-4 flex items-center gap-2">
          <Input
            placeholder="Server URL"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="flex-1 font-mono text-sm"
          />
          <Input
            placeholder="Pubkey (optional)"
            value={pubkey}
            onChange={(e) => setPubkey(e.target.value)}
            className="flex-1 font-mono text-sm"
          />
        </div>

        {/* Stats */}
        {blobs && blobs.length > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" />
                <span>{blobs.length} files</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                <span>{formatBytes(totalSize)}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={blobsLoading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${blobsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}

        {/* Loading State */}
        {blobsLoading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}

        {/* Error State */}
        {blobsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {blobsError.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Empty State */}
        {!blobsLoading && !blobsError && blobs && blobs.length === 0 && pubkey && (
          <div className="text-sm text-muted-foreground">No files found for this pubkey</div>
        )}

        {/* No Pubkey State */}
        {!pubkey && !blobsLoading && (
          <div className="text-sm text-muted-foreground">Enter a pubkey to view files</div>
        )}

        {/* File List */}
        {!blobsLoading && !blobsError && sortedBlobs && sortedBlobs.length > 0 && (
          <>
            <div className="border rounded-lg overflow-hidden mb-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground w-20"></th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Name</th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Size</th>
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground">Modified</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBlobs.map((blob) => (
                    <BlobRow key={blob.sha256} blob={blob} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* JSON Debug */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground mb-2">Raw JSON Response</summary>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(sortedBlobs, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
};

interface BlobRowProps {
  blob: {
    sha256: string;
    url?: string;
    size?: number;
    type?: string;
    uploaded?: number;
  };
}

function BlobRow({ blob }: BlobRowProps) {
  const getFileIcon = (type?: string) => {
    if (!type) return <FileIcon className="h-4 w-4 text-muted-foreground" />;
    if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-600" />;
    if (type.startsWith('video/')) return <Video className="h-4 w-4 text-purple-600" />;
    if (type.startsWith('audio/')) return <Music className="h-4 w-4 text-green-600" />;
    if (type.includes('text') || type.includes('pdf')) return <FileText className="h-4 w-4 text-orange-600" />;
    return <FileIcon className="h-4 w-4 text-muted-foreground" />;
  };

  const isImage = blob.type?.startsWith('image/');
  const isVideo = blob.type?.startsWith('video/');

  return (
    <BlobDetailDialog blob={blob}>
      <tr className="border-b hover:bg-muted/30 cursor-pointer group">
        <td className="p-2">
          <div className="w-16 h-16 rounded overflow-hidden bg-muted/50 flex items-center justify-center">
            {isImage && blob.url ? (
              <img 
                src={blob.url} 
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : isVideo && blob.url ? (
              <video 
                src={blob.url}
                className="w-full h-full object-cover"
                muted
                preload="metadata"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              getFileIcon(blob.type)
            )}
          </div>
        </td>
        <td className="p-2">
          <div className="font-mono text-xs truncate max-w-md">
            {blob.sha256.substring(0, 12)}...{blob.sha256.substring(blob.sha256.length - 8)}
          </div>
        </td>
        <td className="p-2">
          <div className="text-xs text-muted-foreground">
            {blob.type?.split('/')[1] || 'unknown'}
          </div>
        </td>
        <td className="p-2">
          <div className="text-xs text-muted-foreground">
            {blob.size ? formatBytes(blob.size) : '-'}
          </div>
        </td>
        <td className="p-2">
          <div className="text-xs text-muted-foreground">
            {blob.uploaded ? formatDistance(new Date(blob.uploaded * 1000), new Date(), { addSuffix: true }) : '-'}
          </div>
        </td>
        <td className="p-2">
          {blob.url && (
            <a 
              href={blob.url} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </a>
          )}
        </td>
      </tr>
    </BlobDetailDialog>
  );
}

export default Index;
