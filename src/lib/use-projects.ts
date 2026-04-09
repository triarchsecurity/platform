import { useEffect, useState } from 'react';

interface ProjectOption {
  value: string;
  label: string;
}

let cachedProjects: ProjectOption[] | null = null;

export function useProjectOptions() {
  const [options, setOptions] = useState<ProjectOption[]>(
    cachedProjects ?? [{ value: 'all', label: 'All Projects' }]
  );

  useEffect(() => {
    if (cachedProjects) return;

    fetch('/api/platform/projects')
      .then((r) => r.json())
      .then((data) => {
        const projectOptions: ProjectOption[] = [
          { value: 'all', label: 'All Projects' },
          ...data.projects.map((p: { key: string; name: string }) => ({
            value: p.key,
            label: p.name,
          })),
        ];
        cachedProjects = projectOptions;
        setOptions(projectOptions);
      })
      .catch(() => {});
  }, []);

  return options;
}
