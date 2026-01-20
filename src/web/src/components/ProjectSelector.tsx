import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FolderOpen, X } from "lucide-react";
import { api, type KnownProject } from "../lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";

interface ProjectSelectorProps {
  currentProject: { name: string; path: string } | null;
}

export function ProjectSelector({ currentProject }: ProjectSelectorProps) {
  const queryClient = useQueryClient();

  // Fetch all known projects
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
  });

  // Switch project mutation
  const switchMutation = useMutation({
    mutationFn: api.switchProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  // Remove project mutation
  const removeMutation = useMutation({
    mutationFn: api.removeProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const projects = projectsData?.projects || [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <FolderOpen className="h-4 w-4" />
          <span>{currentProject?.name || "No project"}</span>
          {projects.length > 0 && <ChevronDown className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project: KnownProject) => (
          <DropdownMenuItem
            key={project.path}
            className={`flex items-center justify-between cursor-pointer ${
              project.isCurrent ? "bg-accent" : ""
            }`}
            onClick={() => {
              if (!project.isCurrent) {
                switchMutation.mutate(project.path);
              }
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{project.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {project.path}
              </div>
            </div>
            {!project.isCurrent && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-2 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMutation.mutate(project.path);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </DropdownMenuItem>
        ))}
        {projects.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No projects yet
          </div>
        )}
        <DropdownMenuSeparator />
        <div className="px-2 py-2 text-xs text-muted-foreground">
          Use <code className="bg-muted px-1 rounded">daisy use /path</code> to add projects
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
