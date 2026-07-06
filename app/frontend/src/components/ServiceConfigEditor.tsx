import { useEffect } from 'react';
import { useForm } from '@mantine/form';
import { Stack, Switch, TextInput, Button, Group } from '@mantine/core';
import { SERVICE_TYPE, isNpanelType } from '../../../shared/serviceType';
import { NsiteDeployFields } from './NsiteDeployFields';

/** Reusable config-editing form for a service (generic fields, or nsite-specific fields for npanel). */
export const ServiceConfigEditor = ({
  service,
  fields,
  initialValues,
  saving,
  onSubmit,
}: {
  service: any | null;
  fields: any[];
  initialValues: Record<string, string>;
  saving: boolean;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
}) => {
  const isNsite = isNpanelType(service?.type);
  const fakePreset = isNsite ? { id: SERVICE_TYPE.NPANEL, requiredConfig: fields } : null;

  const form = useForm<Record<string, string>>({
    initialValues,
    validateInputOnChange: true,
    validate: (vals: Record<string, string>) => {
      const errors: Record<string, string> = {};
      if (isNsite) return errors;
      for (const field of fields) {
        if (!field.required || field.type === 'boolean') continue;
        if (!(vals[field.id] || '').trim()) {
          errors[field.id] = `${field.name} is required`;
        }
      }
      return errors;
    },
  });

  useEffect(() => {
    form.setValues(initialValues);
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  const canSubmit = !saving && form.isValid();

  const renderConfigField = (field: any) => {
    if (field.type === 'boolean') {
      const checked = (form.values[field.id] || String(field.default || 'false')).toLowerCase() === 'true';
      return (
        <Switch
          key={field.id}
          label={field.name}
          description={field.description}
          checked={checked}
          onChange={(e) => form.setFieldValue(field.id, e.currentTarget.checked ? 'true' : 'false')}
        />
      );
    }

    return (
      <TextInput
        key={field.id}
        label={field.name}
        description={field.description}
        required={field.required}
        {...form.getInputProps(field.id)}
        value={form.values[field.id] ?? String(field.default ?? '')}
      />
    );
  };

  return (
    <form onSubmit={form.onSubmit((vals: Record<string, string>) => void onSubmit(vals))}>
      <Stack gap="md">
        {isNsite && fakePreset ? (
          <NsiteDeployFields
            preset={fakePreset}
            config={form.values}
            setConfig={(next) => {
              const resolved = typeof next === 'function' ? next(form.values) : next;
              for (const [key, value] of Object.entries(resolved)) {
                form.setFieldValue(key, String(value ?? ''));
              }
            }}
            ownerPubkeyHex={null}
          />
        ) : (
          fields.map(renderConfigField)
        )}
        <Group justify="flex-end">
          <Button type="submit" color="green" loading={saving} disabled={!canSubmit}>
            {saving ? 'saving…' : 'save + redeploy'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
};
