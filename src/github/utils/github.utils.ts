export class GithubUtils {
  /**
   * Validate GitHub repository URL
   */
  static isValidGithubUrl(url: string): boolean {
    const githubUrlPattern = /^https?:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/;
    return githubUrlPattern.test(url);
  }

  /**
   * Extract owner and repo from GitHub URL
   */
  static parseGithubUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com[/:]([\w-]+)\/([\w.-]+)/);
    if (!match) return null;

    return {
      owner: match[1],
      repo: match[2].replace('.git', ''),
    };
  }

  /**
   * Sanitize repository name for filesystem
   */
  static sanitizeRepoName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  /**
   * Generate unique clone directory name
   */
  static generateCloneDirName(userId: string, repoName: string): string {
    const timestamp = Date.now();
    const sanitized = this.sanitizeRepoName(repoName);
    return `${userId}_${sanitized}_${timestamp}`;
  }

  /**
   * Check if directory is safe to delete
   */
  static isSafeToDelete(path: string, baseDir: string): boolean {
    return path.startsWith(baseDir) && path !== baseDir;
  }
}
