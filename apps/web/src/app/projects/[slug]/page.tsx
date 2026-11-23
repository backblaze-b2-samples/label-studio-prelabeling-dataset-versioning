"use client";

import { useParams } from "next/navigation";

import { ProjectDetailView } from "@/components/projects/project-detail";

export default function ProjectPage() {
  const { slug } = useParams<{ slug: string }>();
  return <ProjectDetailView slug={slug} />;
}
