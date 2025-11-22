import * as vscode from 'vscode';
import { Bug, BugSeverity, BugStatus } from '../types';

export class BugItem extends vscode.TreeItem {
  constructor(
    public readonly bug: Bug,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(bug.title, collapsibleState);

    this.tooltip = this.generateTooltip();
    this.description = this.generateDescription();
    this.iconPath = this.getIconPath();
    this.contextValue = 'bug';

    // Add command to view details on click
    this.command = {
      command: 'olivex.viewBugDetail',
      title: 'View Bug Details',
      arguments: [this],
    };
  }

  private generateTooltip(): string {
    return `${this.bug.title}\n\nSeverity: ${this.bug.severity}\nStatus: ${this.bug.status}\nID: ${this.bug.id}`;
  }

  private generateDescription(): string {
    const parts: string[] = [];
    
    if (this.bug.cvssScore) {
      parts.push(`CVSS ${this.bug.cvssScore}`);
    }
    
    if (this.bug.affectedFile) {
      const fileName = this.bug.affectedFile.split('/').pop();
      parts.push(fileName || '');
    }

    return parts.join(' • ');
  }

  private getIconPath(): vscode.ThemeIcon {
    const severity = (this.bug.severity || 'low').toLowerCase();
    
    const iconMap: Record<string, string> = {
      'critical': 'error',
      'high': 'warning',
      'medium': 'info',
      'low': 'circle-outline',
      'info': 'circle-filled',
    };

    const colorMap: Record<string, vscode.ThemeColor> = {
      'critical': new vscode.ThemeColor('errorForeground'),
      'high': new vscode.ThemeColor('editorWarning.foreground'),
      'medium': new vscode.ThemeColor('editorInfo.foreground'),
      'low': new vscode.ThemeColor('charts.green'),
      'info': new vscode.ThemeColor('charts.blue'),
    };

    return new vscode.ThemeIcon(
      iconMap[severity] || 'circle-outline', 
      colorMap[severity] || new vscode.ThemeColor('foreground')
    );
  }
}

export class SeverityGroupItem extends vscode.TreeItem {
  constructor(
    public readonly severity: BugSeverity,
    public readonly count: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(`${severity.toUpperCase()} (${count})`, collapsibleState);
    this.contextValue = 'severityGroup';
  }
}

export class BugTreeProvider implements vscode.TreeDataProvider<BugItem | SeverityGroupItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BugItem | SeverityGroupItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private bugs: Bug[] = [];
  private groupBySeverity: boolean = true;

  refresh(bugs?: Bug[]): void {
    if (bugs) {
      this.bugs = bugs;
    }
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this.bugs = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BugItem | SeverityGroupItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BugItem | SeverityGroupItem): Thenable<(BugItem | SeverityGroupItem)[]> {
    if (!element) {
      // Root level
      if (this.groupBySeverity) {
        return Promise.resolve(this.getSeverityGroups());
      } else {
        return Promise.resolve(this.bugs.map(bug => new BugItem(bug, vscode.TreeItemCollapsibleState.None)));
      }
    } else if (element instanceof SeverityGroupItem) {
      // Show bugs for this severity
      const bugs = this.bugs.filter(b => (b.severity || 'low').toLowerCase() === element.severity.toLowerCase());
      return Promise.resolve(bugs.map(bug => new BugItem(bug, vscode.TreeItemCollapsibleState.None)));
    }

    return Promise.resolve([]);
  }

  private getSeverityGroups(): SeverityGroupItem[] {
    // Get unique severities from actual bugs
    const severities = [...new Set(this.bugs.map(b => (b.severity || 'low').toLowerCase()))];
    const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
    
    // Sort by severity order
    const sortedSeverities = severities.sort((a, b) => {
      return severityOrder.indexOf(a) - severityOrder.indexOf(b);
    });

    const groups: SeverityGroupItem[] = [];

    for (const severity of sortedSeverities) {
      const count = this.bugs.filter(b => (b.severity || 'low').toLowerCase() === severity).length;
      if (count > 0) {
        groups.push(
          new SeverityGroupItem(
            severity as any,
            count,
            vscode.TreeItemCollapsibleState.Expanded
          )
        );
      }
    }

    return groups;
  }

  getBugs(): Bug[] {
    return this.bugs;
  }

  getBugById(id: string): Bug | undefined {
    return this.bugs.find(b => b.id === id);
  }
}
