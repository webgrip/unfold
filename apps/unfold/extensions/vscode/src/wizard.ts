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

export type StepFunction<S> = (state: S, position: { step: number; total: number; canGoBack: boolean }) => Promise<StepResult<Partial<S>>>;
export type Step<S> = StepFunction<S> | { applies: (state: S) => boolean; run: StepFunction<S> };

function applicable<S>(step: Step<S>, state: S): boolean { return typeof step === 'function' || step.applies(state); }

export async function run<S>(initial: S, steps: Step<S>[]): Promise<S | undefined> {
  let state = initial;
  let index = 0;
  let direction = 1;
  while (index < steps.length) {
    const step = steps[index];
    if (!applicable(step, state)) { index = Math.max(0, index + direction); if (index === 0 && direction < 0) direction = 1; continue; }
    const active = steps.filter(item => applicable(item, state));
    const position = active.indexOf(step);
    const result = await (typeof step === 'function' ? step : step.run)(state, { step: position + 1, total: active.length, canGoBack: position > 0 });
    if (result === undefined) return undefined;
    if (result === back) { direction = -1; index = Math.max(0, index - 1); continue; }
    direction = 1;
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
