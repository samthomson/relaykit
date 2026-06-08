import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Loader, ScrollArea, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { toast } from 'sonner';
import { trpc } from '../trpc';
import { SERVICE_TYPE, isNpanelType } from '../../../shared/serviceType';
import { NsiteDeployFields, prepareNsiteConfigForSave } from './NsiteDeployFields';

type Field = { id: string; name: string; description?: string; type?: string; required?: boolean; default?: string };

// The service's deploy-time config (env vars from the preset's requiredConfig), rendered inline
// as a tab. Saving redeploys the service — same backend path the old modal used.
export const ServiceConfigPanel = ({ service, onSaved }: { service: any; onSaved?: () => void }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  const isNsite = isNpanelType(service?.type);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpc.getServiceConfig
      .query({ composeId: service.composeId })
      .then((res: any) => {
        if (cancelled) return;
        setFields(res.fields || []);
        setValues(res.config || {});
      })
      .catch((e: any) => !cancelled && setError(e?.message ?? 'failed to load config'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [service.composeId]);

  const setField = (id: string, value: string) => setValues((v) => ({ ...v, [id]: value }));

  const missingRequired = useMemo(
    () => !isNsite && fields.some((f) => f.required && f.type !== 'boolean' && !(values[f.id] || '').trim()),
    [fields, values, isNsite],
  );

  const save = async () => {
    setSaving(true);
    try {
      const config = isNsite ? prepareNsiteConfigForSave(values) : values;
      await trpc.updateServiceConfig.mutate({ composeId: service.composeId, config });
      toast.success('config updated, redeploy started');
      onSaved?.();
    } catch (e: any) {
      toast.error(`failed to update config: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Group gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">loading config…</Text>
      </Group>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={16} />} title="error">
        {error}
      </Alert>
    );
  }

  const renderField = (field: Field) => {
    if (field.type === 'boolean') {
      const checked = (values[field.id] || String(field.default || 'false')).toLowerCase() === 'true';
      return (
        <Switch
          key={field.id}
          label={field.name}
          description={field.description}
          checked={checked}
          onChange={(e) => setField(field.id, e.currentTarget.checked ? 'true' : 'false')}
        />
      );
    }
    return (
      <TextInput
        key={field.id}
        label={field.name}
        description={field.description}
        required={field.required}
        value={values[field.id] ?? String(field.default ?? '')}
        onChange={(e) => setField(field.id, e.currentTarget.value)}
      />
    );
  };

  return (
    <ScrollArea.Autosize mah="68vh" type="auto" offsetScrollbars>
      <Stack gap="md" pr="sm">
        {fields.length === 0 ? (
          <Text size="sm" c="dimmed">no editable config for this service.</Text>
        ) : (
          <>
            {isNsite ? (
              <NsiteDeployFields
                preset={{ id: SERVICE_TYPE.NPANEL, requiredConfig: fields }}
                config={values}
                setConfig={(next: any) => setValues((prev) => (typeof next === 'function' ? next(prev) : next))}
                ownerPubkeyHex={null}
              />
            ) : (
              fields.map(renderField)
            )}
            <Group justify="flex-end">
              <Button color="green" loading={saving} disabled={saving || missingRequired} onClick={save}>
                {saving ? 'saving…' : 'save + redeploy'}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </ScrollArea.Autosize>
  );
};
