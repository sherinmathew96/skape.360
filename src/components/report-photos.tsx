"use client";

import { useRouter } from "next/navigation";
import { addReportPhoto } from "@/app/site-actions";
import { Uploader } from "./uploader";

/** Take or pick several photos at once; each is shrunk, uploaded and added to the report. */
export function ReportPhotoUpload({ projectId, reportId }: { projectId: string; reportId: string }) {
  const router = useRouter();
  return (
    <Uploader
      projectId={projectId}
      kind="photo"
      multiple
      label="Add photos"
      onUploaded={async (fileId) => {
        await addReportPhoto({ projectId, reportId, fileId });
        router.refresh();
      }}
    />
  );
}
