import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { branchNameSchema, validateInput } from "@/lib/input-validation";

const repoSettingsSchema = z.object({
  description: z.string().max(350, "Description must be less than 350 characters").optional(),
  homepage: z.string().max(255, "Homepage URL must be less than 255 characters").optional(),
  private: z.boolean(),
  default_branch: z.string().optional(),
  topics: z.string().optional(),
});

type RepoSettingsForm = z.infer<typeof repoSettingsSchema>;

interface Repository {
  name: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  private: boolean;
  default_branch?: string;
  topics?: string[];
}

interface RepositorySettingsDialogProps {
  repo: Repository | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export const RepositorySettingsDialog = ({
  repo,
  open,
  onOpenChange,
  onUpdate,
}: RepositorySettingsDialogProps) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const [showRenameBranch, setShowRenameBranch] = useState(false);
  const [selectedBranchToRename, setSelectedBranchToRename] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [isRenamingBranch, setIsRenamingBranch] = useState(false);
  const [showDeleteBranch, setShowDeleteBranch] = useState(false);
  const [selectedBranchToDelete, setSelectedBranchToDelete] = useState("");
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);
  const [confirmBranchName, setConfirmBranchName] = useState("");

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<RepoSettingsForm>({
    resolver: zodResolver(repoSettingsSchema),
    defaultValues: {
      description: "",
      homepage: "",
      private: false,
      default_branch: "",
      topics: "",
    },
    values: repo ? {
      description: repo.description || "",
      homepage: repo.homepage || "",
      private: repo.private,
      default_branch: repo.default_branch || "",
      topics: repo.topics?.join(", ") || "",
    } : undefined,
  });

  useEffect(() => {
    if (repo && open) {
      // Reset state when dialog opens
      setBranches([]);
      setShowRenameBranch(false);
      setShowDeleteBranch(false);
      setSelectedBranchToRename("");
      setSelectedBranchToDelete("");
      setNewBranchName("");
      setConfirmBranchName("");
      fetchBranches();
    }
  }, [repo, open]);

  const fetchBranches = async () => {
    if (!repo) return;
    
    setIsFetchingBranches(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.provider_token) {
        console.error('No provider token available');
        toast({
          variant: "destructive",
          title: "Authentication required",
          description: "Please sign in again to manage branches",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('get-repo-branches', {
        body: { 
          repositoryName: repoName,
          provider_token: session.provider_token,
        }
      });
      
      if (error) {
        console.error('Error invoking get-repo-branches:', error);
        toast({
          variant: "destructive",
          title: "Failed to fetch branches",
          description: "Unable to load branches. Please try again.",
        });
        return;
      }
      
      if (data?.error) {
        console.error('API error fetching branches:', data.error);
        toast({
          variant: "destructive",
          title: "Failed to fetch branches",
          description: data.error,
        });
        return;
      }
      
      if (data?.branches && Array.isArray(data.branches)) {
        const branchNames = data.branches.map((b: any) => b.name);
        console.log('Fetched branches:', branchNames);
        setBranches(branchNames);
      } else {
        console.error('Unexpected response format:', data);
        setBranches([]);
      }
    } catch (err) {
      console.error('Exception fetching branches:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch branches. Please try again.",
      });
      setBranches([]);
    } finally {
      setIsFetchingBranches(false);
    }
  };

  const isPrivate = watch("private");

  const onSubmit = async (data: RepoSettingsForm) => {
    if (!repo) return;

    setIsSaving(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      
      // Prepare topics array
      const topicsArray = data.topics 
        ? data.topics.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('update-repo', {
        body: {
          owner,
          repo: repoName,
          description: data.description || "",
          homepage: data.homepage || "",
          private: data.private,
          default_branch: data.default_branch || repo.default_branch,
          topics: topicsArray,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Settings updated",
        description: "Repository settings have been saved successfully",
      });

      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update repository settings",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRepo = async () => {
    if (!repo) return;
    
    setIsDeleting(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('delete-repo', {
        body: { 
          owner, 
          repo: repoName,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Repository deleted",
        description: `${repo.name} has been permanently deleted`,
      });

      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete repository",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameBranch = async () => {
    if (!repo || !selectedBranchToRename || !newBranchName) return;
    
    // Validate new branch name
    const error = validateInput(branchNameSchema, newBranchName);
    if (error) {
      toast({
        variant: "destructive",
        title: "Invalid branch name",
        description: error,
      });
      return;
    }
    
    setIsRenamingBranch(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('rename-branch', {
        body: {
          owner,
          repo: repoName,
          old_name: selectedBranchToRename,
          new_name: newBranchName,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Branch renamed",
        description: `${selectedBranchToRename} has been renamed to ${newBranchName}`,
      });

      setShowRenameBranch(false);
      setSelectedBranchToRename("");
      setNewBranchName("");
      // Wait a moment for GitHub to update before refetching
      setTimeout(() => fetchBranches(), 500);
      onUpdate();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to rename branch",
      });
    } finally {
      setIsRenamingBranch(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!repo || !selectedBranchToDelete || confirmBranchName !== selectedBranchToDelete) return;
    
    setIsDeletingBranch(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('delete-branch', {
        body: {
          owner,
          repo: repoName,
          branch: selectedBranchToDelete,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Branch deleted",
        description: `${selectedBranchToDelete} has been permanently deleted`,
      });

      setShowDeleteBranch(false);
      setSelectedBranchToDelete("");
      setConfirmBranchName("");
      // Wait a moment for GitHub to update before refetching
      setTimeout(() => fetchBranches(), 500);
      onUpdate();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete branch",
      });
    } finally {
      setIsDeletingBranch(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Repository Settings</DialogTitle>
          <DialogDescription>
            Update settings for {repo?.name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="A short description of your repository"
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="homepage">Homepage URL</Label>
            <Input
              id="homepage"
              type="url"
              placeholder="https://example.com"
              {...register("homepage")}
            />
            {errors.homepage && (
              <p className="text-sm text-destructive">{errors.homepage.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_branch">Default Branch</Label>
            <Select
              value={watch("default_branch") || repo?.default_branch}
              onValueChange={(value) => setValue("default_branch", value)}
            >
              <SelectTrigger id="default_branch">
                <SelectValue placeholder="Select default branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The default branch for pull requests and code commits
            </p>
          </div>

          <div className="space-y-2">
            <Label>Branch Management</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRenameBranch(!showRenameBranch)}
                className="flex-1"
              >
                Rename Branch
              </Button>
            </div>
            
            {showRenameBranch && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                <div className="space-y-2">
                  <Label htmlFor="branch_to_rename">Select Branch to Rename</Label>
                  <Select
                    value={selectedBranchToRename}
                    onValueChange={setSelectedBranchToRename}
                  >
                    <SelectTrigger id="branch_to_rename">
                      <SelectValue placeholder="Choose a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedBranchToRename && (
                  <div className="space-y-2">
                    <Label htmlFor="new_branch_name">New Branch Name</Label>
                    <Input
                      id="new_branch_name"
                      placeholder="Enter new branch name"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                    />
                  </div>
                )}
                
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRenameBranch(false);
                      setSelectedBranchToRename("");
                      setNewBranchName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleRenameBranch}
                    disabled={!selectedBranchToRename || !newBranchName || isRenamingBranch}
                  >
                    {isRenamingBranch ? "Renaming..." : "Confirm Rename"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="topics">Topics</Label>
            <Input
              id="topics"
              placeholder="react, typescript, web (comma-separated)"
              {...register("topics")}
            />
            <p className="text-xs text-muted-foreground">
              Add topics to help people find your repository
            </p>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="private">Private Repository</Label>
              <p className="text-sm text-muted-foreground">
                {isPrivate ? "Only you can see this repository" : "Anyone can see this repository"}
              </p>
            </div>
            <Switch
              id="private"
              checked={isPrivate ?? false}
              onCheckedChange={(checked) => setValue("private", checked)}
            />
          </div>

          <Separator className="my-6" />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold text-destructive">Danger Zone</h3>
            </div>
            
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">Delete a branch</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Permanently delete a branch. This action cannot be undone.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowDeleteBranch(!showDeleteBranch)}
                    disabled={showDeleteBranch}
                  >
                    Delete Branch
                  </Button>
                </div>

                {showDeleteBranch && (
                  <div className="pt-3 border-t border-destructive/20 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="branch_to_delete">Select Branch to Delete</Label>
                      <Select
                        value={selectedBranchToDelete}
                        onValueChange={(value) => {
                          setSelectedBranchToDelete(value);
                          setConfirmBranchName("");
                        }}
                      >
                        <SelectTrigger id="branch_to_delete">
                          <SelectValue placeholder="Choose a branch" />
                        </SelectTrigger>
                <SelectContent>
                  {isFetchingBranches ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading branches...</div>
                  ) : branches.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No branches found</div>
                  ) : branches.filter(branch => branch !== repo?.default_branch).length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No branches available to delete</div>
                  ) : (
                    branches
                      .filter(branch => branch !== repo?.default_branch)
                      .map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
                      </Select>
                    </div>

                    {selectedBranchToDelete && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          Type <code className="px-1 py-0.5 bg-muted rounded">{selectedBranchToDelete}</code> to confirm deletion:
                        </p>
                        <div className="flex gap-2">
                          <Input
                            placeholder={selectedBranchToDelete}
                            value={confirmBranchName}
                            onChange={(e) => setConfirmBranchName(e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDeleteBranch}
                            disabled={confirmBranchName !== selectedBranchToDelete || isDeletingBranch}
                          >
                            {isDeletingBranch ? "Deleting..." : "Delete Branch"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator className="bg-destructive/20" />

              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Delete this repository</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Once deleted, it will be gone forever. Please be certain.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowDangerZone(true)}
                    disabled={showDangerZone}
                  >
                    Delete Repository
                  </Button>
                </div>

                {showDangerZone && (
                  <div className="mt-4 pt-4 border-t border-destructive/20">
                    <p className="text-sm font-medium mb-2">
                      Type <code className="px-1 py-0.5 bg-muted rounded">{repo?.name}</code> to confirm deletion:
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={repo?.name}
                        onChange={(e) => {
                          if (e.target.value === repo?.name) {
                            e.target.dataset.confirmed = "true";
                          } else {
                            delete e.target.dataset.confirmed;
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleDeleteRepo}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "I understand, delete"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
