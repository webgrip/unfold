import * as vscode from 'vscode';

export const back = Symbol('back');
export type StepResult<T> = T | typeof back | undefined;

type PickOptions<T> = { title: string; placeholder: string; items: (vscode.QuickPickItem & { value: T })[]; selected?: T; step: number; total: number; canGoBack: boolean; matchOnDescription?: boolean; matchOnDetail?: boolean };
type InputOptions = { title: string; prompt: string; value?: string; password?: boolean; step: number; total: number; canGoBack: boolean; validate: (value: string) => string | undefined };

export function pick<T>(options: PickOptions<T>): Promise<StepResult<T>> {
  return new Promise(resolve => {
    const picker = vscode.window.createQuickPick<vscode.QuickPickItem & { value: T }>();
    picker.title = options.title;
    picker.step = options.step;
    picker.totalSteps = options.total;
    picker.placeholder = options.placeholder;
    picker.items = options.items;
    picker.matchOnDescription = options.matchOnDescription ?? true;
    picker.matchOnDetail = options.matchOnDetail ?? true;
    picker.ignoreFocusOut = true;
    picker.buttons = options.canGoBack ? [vscode.QuickInputButtons.Back] : [];
    const active = options.items.find(item => item.value === options.selected);
    if (active) picker.activeItems = [active];
    let settled = false;
    const finish = (value: StepResult<T>) => { if (settled) return; settled = true; picker.hide(); picker.dispose(); resolve(value); };
    picker.onDidTriggerButton(button => { if (button === vscode.QuickInputButtons.Back) finish(back); });
    picker.onDidAccept(() => finish(picker.selectedItems[0]?.value));
    picker.onDidHide(() => finish(undefined));
    picker.show();
  });
}

export function input(options: InputOptions): Promise<StepResult<string>> {
  return new Promise(resolve => {
    const box = vscode.window.createInputBox();
    box.title = options.title;
    box.step = options.step;
    box.totalSteps = options.total;
    box.prompt = options.prompt;
    box.value = options.value ?? '';
    box.password = Boolean(options.password);
    box.ignoreFocusOut = true;
    box.buttons = options.canGoBack ? [vscode.QuickInputButtons.Back] : [];
    let settled = false;
    const finish = (value: StepResult<string>) => { if (settled) return; settled = true; box.hide(); box.dispose(); resolve(value); };
    box.onDidChangeValue(value => { box.validationMessage = options.validate(value); });
    box.onDidTriggerButton(button => { if (button === vscode.QuickInputButtons.Back) finish(back); });
    box.onDidAccept(() => { const problem = options.validate(box.value); if (problem) { box.validationMessage = problem; return; } finish(box.value); });
    box.onDidHide(() => finish(undefined));
    box.show();
  });
}

export type Step<S> = (state: S, position: { step: number; total: number; canGoBack: boolean }) => Promise<StepResult<Partial<S>>>;

export async function run<S>(initial: S, steps: Step<S>[]): Promise<S | undefined> {
  let state = initial;
  let index = 0;
  while (index < steps.length) {
    const result = await steps[index](state, { step: index + 1, total: steps.length, canGoBack: index > 0 });
    if (result === undefined) return undefined;
    if (result === back) { index = Math.max(0, index - 1); continue; }
    state = { ...state, ...result };
    index++;
  }
  return state;
}

export function budgetItems(maxBudgetUsd: number, demo: boolean): (vscode.QuickPickItem & { value: number | 'custom' })[] {
  const presets = [1, 3, 5, 10, 25].filter(amount => amount < maxBudgetUsd);
  return [
    ...presets.map(amount => ({ label: `$${amount.toFixed(2)}`, description: demo ? 'Demonstration allocation; spend stays $0' : amount <= 3 ? 'Small fix or investigation' : amount <= 10 ? 'Feature with review' : 'Extended engagement', value: amount })),
    { label: `$${maxBudgetUsd.toFixed(2)}`, description: 'Deployment maximum', value: maxBudgetUsd },
    { label: '$(edit) Custom amount…', description: `Any amount up to $${maxBudgetUsd.toFixed(2)}`, value: 'custom' as const },
  ];
}
