import { useMutation } from "@tanstack/react-query";
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { getEffectiveBlossomServers } from "@/lib/appBlossom";

interface UploadInput {
  file: File
  servers?: string[]
}

export function useUploadFile() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (input: File | UploadInput) => {
      if (!user) {
        throw new Error('Must be logged in to upload files');
      }

      const file = input instanceof File ? input : input.file
      const serverOverride = input instanceof File ? undefined : input.servers

      const servers = serverOverride ?? getEffectiveBlossomServers(
        config.blossomServerMetadata,
        config.useAppBlossomServers,
      );

      if (servers.length === 0) {
        throw new Error('No Blossom servers configured');
      }

      const uploader = new BlossomUploader({
        servers,
        signer: user.signer,
      });

      const tags = await uploader.upload(file);
      return tags;
    },
  });
}
