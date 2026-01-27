import { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Plus,
  Upload,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Download,
  RefreshCw,
  Server,
  FileKey,
  Key,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useSSLStatus,
  useSSLCertificates,
  useUpdateSSLSettings,
  useGenerateSelfSigned,
  useUploadCertificate,
  useActivateCertificate,
  useDeleteCertificate,
  SSLCertificate,
} from '@/hooks/useSSL';
import { formatDistanceToNow } from 'date-fns';

const API_BASE = import.meta.env.VITE_API_URL || '';

function CertificateStatusBadge({ cert }: { cert: SSLCertificate }) {
  if (cert.isExpired) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        Expired
      </Badge>
    );
  }
  if (cert.expiresInDays <= 30) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-500">
        <Clock className="w-3 h-3" />
        Expires in {cert.expiresInDays} days
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-500">
      <CheckCircle className="w-3 h-3" />
      Valid
    </Badge>
  );
}

function CertificateCard({ cert, onActivate, onDelete }: {
  cert: SSLCertificate;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className={cn(
      "bg-white/5 border-white/10",
      cert.isActive && "border-emerald-500/50 bg-emerald-500/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              cert.isActive ? "bg-emerald-500/20" : "bg-white/10"
            )}>
              {cert.isSelfSigned ? (
                <Key className={cn("w-5 h-5", cert.isActive ? "text-emerald-400" : "text-gray-400")} />
              ) : (
                <FileKey className={cn("w-5 h-5", cert.isActive ? "text-emerald-400" : "text-gray-400")} />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{cert.name}</h3>
                {cert.isActive && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">Active</Badge>
                )}
                {cert.isSelfSigned && (
                  <Badge variant="outline" className="text-xs">Self-signed</Badge>
                )}
              </div>
              <p className="text-sm text-gray-400">
                CN: {cert.commonName || 'Unknown'} â€¢ Issued by: {cert.issuer || 'Unknown'}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {cert.validUntil && (
                  <span>
                    Expires: {new Date(cert.validUntil).toLocaleDateString()}
                  </span>
                )}
                <span>
                  Created: {formatDistanceToNow(new Date(cert.createdAt), { addSuffix: true })}
                </span>
              </div>
              {cert.fingerprint && (
                <p className="text-xs text-gray-600 font-mono mt-2 truncate max-w-md" title={cert.fingerprint}>
                  SHA256: {cert.fingerprint.substring(0, 47)}...
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <CertificateStatusBadge cert={cert} />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`${API_BASE}/api/v1/ssl/certificates/${cert.id}/download`, '_blank')}
                title="Download certificate"
              >
                <Download className="w-4 h-4" />
              </Button>
              {!cert.isActive && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onActivate(cert.id)}
                    title="Set as active"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(cert.id)}
                    className="text-red-400 hover:text-red-300"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SSLSettings() {
  const { toast } = useToast();
  const { data: status, isLoading: statusLoading } = useSSLStatus();
  const { data: certsData, isLoading: certsLoading } = useSSLCertificates();
  const updateSettings = useUpdateSSLSettings();
  const generateSelfSigned = useGenerateSelfSigned();
  const uploadCertificate = useUploadCertificate();
  const activateCertificate = useActivateCertificate();
  const deleteCertificate = useDeleteCertificate();

  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  
  // Generate form state
  const [genName, setGenName] = useState('FlowForge Self-Signed');
  const [genCommonName, setGenCommonName] = useState('flowforge.local');
  const [genOrg, setGenOrg] = useState('FlowForge');
  const [genDays, setGenDays] = useState('365');
  
  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadCert, setUploadCert] = useState('');
  const [uploadKey, setUploadKey] = useState('');
  const [uploadCA, setUploadCA] = useState('');

  const handleToggleHTTPS = async (enabled: boolean) => {
    try {
      await updateSettings.mutateAsync({ httpsEnabled: enabled });
      toast({
        title: enabled ? 'HTTPS Enabled' : 'HTTPS Disabled',
        description: 'Restart FlowForge to apply changes.',
      });
    } catch (error) {
      toast({
        title: 'Failed to update settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleSettingsChange = async (settings: Record<string, boolean | number | string>) => {
    try {
      await updateSettings.mutateAsync(settings);
      toast({ title: 'Settings updated' });
    } catch {
      toast({
        title: 'Failed to update settings',
        variant: 'destructive',
      });
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateSelfSigned.mutateAsync({
        name: genName,
        commonName: genCommonName,
        organization: genOrg,
        validDays: parseInt(genDays),
        setActive: true,
      });
      toast({
        title: 'Certificate Generated',
        description: result.note,
      });
      setShowGenerateDialog(false);
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleUpload = async () => {
    try {
      await uploadCertificate.mutateAsync({
        name: uploadName,
        certificate: uploadCert,
        privateKey: uploadKey,
        caBundle: uploadCA || undefined,
        setActive: true,
      });
      toast({ title: 'Certificate Uploaded' });
      setShowUploadDialog(false);
      setUploadName('');
      setUploadCert('');
      setUploadKey('');
      setUploadCA('');
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await activateCertificate.mutateAsync(id);
      toast({
        title: 'Certificate Activated',
        description: 'Restart FlowForge to apply changes.',
      });
    } catch {
      toast({
        title: 'Activation failed',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCertificate.mutateAsync(id);
      toast({ title: 'Certificate Deleted' });
    } catch {
      toast({
        title: 'Delete failed',
        variant: 'destructive',
      });
    }
  };

  const settings = status?.settings;
  const activeCert = status?.activeCertificate;
  const certificates = certsData?.certificates || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-white">
            <Shield className="w-8 h-8" />
            SSL / TLS Settings
          </h1>
          <p className="text-gray-400 mt-1">
            Configure HTTPS encryption for secure connections
          </p>
        </div>
      </div>

      {/* Status Card */}
      <Card className={cn(
        "bg-white/5 border-white/10",
        status?.httpsAvailable && settings?.httpsEnabled
          ? "border-emerald-500/30 bg-emerald-500/5"
          : activeCert
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-red-500/30 bg-red-500/5"
      )}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-xl",
                status?.httpsAvailable && settings?.httpsEnabled
                  ? "bg-emerald-500/20"
                  : activeCert
                  ? "bg-amber-500/20"
                  : "bg-red-500/20"
              )}>
                {status?.httpsAvailable && settings?.httpsEnabled ? (
                  <ShieldCheck className="w-8 h-8 text-emerald-400" />
                ) : activeCert ? (
                  <Shield className="w-8 h-8 text-amber-400" />
                ) : (
                  <ShieldAlert className="w-8 h-8 text-red-400" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {status?.httpsAvailable && settings?.httpsEnabled
                    ? 'HTTPS Enabled'
                    : activeCert
                    ? 'HTTPS Ready (Not Enabled)'
                    : 'No Certificate Configured'}
                </h2>
                <p className="text-gray-400">
                  {status?.httpsAvailable && settings?.httpsEnabled
                    ? `Secure connections on port ${settings?.httpsPort}`
                    : activeCert
                    ? 'Certificate available, enable HTTPS to secure connections'
                    : 'Generate or upload a certificate to enable HTTPS'}
                </p>
              </div>
            </div>
            {activeCert && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-gray-400">Active Certificate</p>
                  <p className="font-medium text-white">{activeCert.commonName}</p>
                </div>
                <Switch
                  checked={settings?.httpsEnabled ?? false}
                  onCheckedChange={handleToggleHTTPS}
                  disabled={updateSettings.isPending || statusLoading}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings & Certificates */}
      <Tabs defaultValue="certificates" className="space-y-4">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="certificates" className="data-[state=active]:bg-white/10">
            Certificates
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-white/10">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="certificates" className="space-y-4">
          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={() => setShowGenerateDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" />
              Generate Self-Signed
            </Button>
            <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Certificate
            </Button>
          </div>

          {/* Certificates List */}
          {certsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse bg-white/5 border-white/10">
                  <CardContent className="p-4 h-24" />
                </Card>
              ))}
            </div>
          ) : certificates.length === 0 ? (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="py-12 text-center">
                <Lock className="w-12 h-12 mx-auto text-gray-500 mb-4" />
                <h3 className="font-semibold text-white">No Certificates</h3>
                <p className="text-gray-400 mb-4">
                  Generate a self-signed certificate or upload your own to enable HTTPS.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {certificates.map((cert) => (
                <CertificateCard
                  key={cert.id}
                  cert={cert}
                  onActivate={handleActivate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">HTTPS Configuration</CardTitle>
              <CardDescription>Configure how HTTPS behaves</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* HTTPS Port */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white">HTTPS Port</Label>
                  <p className="text-sm text-gray-400">Port for HTTPS connections</p>
                </div>
                <Input
                  type="number"
                  value={settings?.httpsPort ?? 3443}
                  onChange={(e) => handleSettingsChange({ httpsPort: parseInt(e.target.value) })}
                  className="w-32 bg-white/5 border-white/10"
                />
              </div>

              {/* Force HTTPS */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white">Force HTTPS</Label>
                  <p className="text-sm text-gray-400">Redirect all HTTP requests to HTTPS</p>
                </div>
                <Switch
                  checked={settings?.forceHttps ?? false}
                  onCheckedChange={(checked) => handleSettingsChange({ forceHttps: checked })}
                />
              </div>

              {/* HSTS */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white">HSTS (HTTP Strict Transport Security)</Label>
                  <p className="text-sm text-gray-400">Tell browsers to always use HTTPS</p>
                </div>
                <Switch
                  checked={settings?.hstsEnabled ?? false}
                  onCheckedChange={(checked) => handleSettingsChange({ hstsEnabled: checked })}
                />
              </div>

              {/* Min TLS Version */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white">Minimum TLS Version</Label>
                  <p className="text-sm text-gray-400">Lowest TLS version to accept</p>
                </div>
                <Select
                  value={settings?.minTlsVersion ?? '1.2'}
                  onValueChange={(value) => handleSettingsChange({ minTlsVersion: value })}
                >
                  <SelectTrigger className="w-32 bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.2">TLS 1.2</SelectItem>
                    <SelectItem value="1.3">TLS 1.3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Server className="w-5 h-5" />
                Connection Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">HTTP URL</span>
                <code className="text-white bg-black/30 px-2 py-1 rounded">
                  http://{window.location.hostname}:3000
                </code>
              </div>
              {settings?.httpsEnabled && (
                <div className="flex justify-between">
                  <span className="text-gray-400">HTTPS URL</span>
                  <code className="text-emerald-400 bg-black/30 px-2 py-1 rounded">
                    https://{window.location.hostname}:{settings.httpsPort}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Generate Self-Signed Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="bg-gray-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Generate Self-Signed Certificate</DialogTitle>
            <DialogDescription>
              Create a self-signed certificate for development or internal use.
              Browsers will show a warning for self-signed certificates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Certificate Name</Label>
              <Input
                value={genName}
                onChange={(e) => setGenName(e.target.value)}
                placeholder="FlowForge Self-Signed"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div>
              <Label className="text-white">Common Name (Domain)</Label>
              <Input
                value={genCommonName}
                onChange={(e) => setGenCommonName(e.target.value)}
                placeholder="flowforge.local"
                className="bg-white/5 border-white/10"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use your server's hostname or IP address
              </p>
            </div>
            <div>
              <Label className="text-white">Organization</Label>
              <Input
                value={genOrg}
                onChange={(e) => setGenOrg(e.target.value)}
                placeholder="FlowForge"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div>
              <Label className="text-white">Valid for (days)</Label>
              <Input
                type="number"
                value={genDays}
                onChange={(e) => setGenDays(e.target.value)}
                placeholder="365"
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateSelfSigned.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {generateSelfSigned.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Certificate Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="bg-gray-900 border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Upload Certificate</DialogTitle>
            <DialogDescription>
              Upload a certificate from a Certificate Authority (CA) or your own PKI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Certificate Name</Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Production Certificate"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div>
              <Label className="text-white">Certificate (PEM)</Label>
              <Textarea
                value={uploadCert}
                onChange={(e) => setUploadCert(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                className="bg-white/5 border-white/10 font-mono text-sm h-32"
              />
            </div>
            <div>
              <Label className="text-white">Private Key (PEM)</Label>
              <Textarea
                value={uploadKey}
                onChange={(e) => setUploadKey(e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                className="bg-white/5 border-white/10 font-mono text-sm h-32"
              />
            </div>
            <div>
              <Label className="text-white">CA Bundle (Optional)</Label>
              <Textarea
                value={uploadCA}
                onChange={(e) => setUploadCA(e.target.value)}
                placeholder="Intermediate certificates, if any"
                className="bg-white/5 border-white/10 font-mono text-sm h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadCertificate.isPending || !uploadName || !uploadCert || !uploadKey}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {uploadCertificate.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

