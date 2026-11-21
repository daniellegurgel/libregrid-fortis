/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllCommunityModule, createGrid, ModuleRegistry, type GridApi } from 'ag-grid-community';
import { SetFilter } from './setFilter';
import { SetFilterModule } from './setFilterModule';

interface Row {
  country: string;
}

let api: GridApi<Row> | undefined;

afterEach(() => {
  api?.destroy();
  api = undefined;
});

describe('SetFilterModule', () => {
  it('filters grid rows and round-trips a set model', async () => {
    ModuleRegistry.registerModules([AllCommunityModule, SetFilterModule]);
    const element = document.createElement('div');
    document.body.appendChild(element);
    api = createGrid(element, {
      enableFilterHandlers: false,
      columnDefs: [{ field: 'country', filter: 'agSetColumnFilter', filterParams: { values: ['UK', 'US', 'DE'] } }],
      rowData: [{ country: 'UK' }, { country: 'US' }, { country: 'DE' }],
    });

    api.setFilterModel({ country: { filterType: 'set', values: ['US'] } });
    api.onFilterChanged();
    await vi.waitFor(() => expect(api?.getDisplayedRowCount()).toBe(1));
    expect(api.getDisplayedRowAtIndex(0)?.data).toEqual({ country: 'US' });

    expect(api.getFilterModel()).toEqual({ country: { filterType: 'set', values: ['US'] } });
    api.setFilterModel(null);
    await vi.waitFor(() => expect(api?.getDisplayedRowCount()).toBe(3));
  });

  it('filters through the registered handler when filter handlers are enabled', async () => {
    ModuleRegistry.registerModules([AllCommunityModule, SetFilterModule]);
    const element = document.createElement('div');
    document.body.appendChild(element);
    api = createGrid(element, {
      enableFilterHandlers: true,
      columnDefs: [{ field: 'country', filter: 'agSetColumnFilter' }],
      rowData: [{ country: 'UK' }, { country: 'US' }],
    });

    api.setFilterModel({ country: { filterType: 'set', values: ['UK'] } });
    await vi.waitFor(() => expect(api?.getDisplayedRowCount()).toBe(1));
    expect(api.getFilterModel()).toEqual({ country: { filterType: 'set', values: ['UK'] } });
  });

  it('virtualises large value lists and applies a mini filter case-insensitively', () => {
    const filter = new SetFilter();
    const values = Array.from({ length: 50_000 }, (_, index) => `Value ${index}`);
    const events = { changed: 0, modified: 0 };
    filter.init({
      values,
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined },
      context: undefined,
      colDef: {},
      column: {} as never,
      getValue: () => null,
      doesRowPassOtherFilter: () => true,
      rowModel: {} as never,
      filterChangedCallback: () => events.changed++,
      filterModifiedCallback: () => events.modified++,
    });

    filter.setMiniFilter('value 49999');
    expect(filter.getGui().querySelectorAll('.lgr-set-filter-value')).toHaveLength(1);
    expect(filter.getGui().textContent).toContain('Value 49999');
    expect(events).toEqual({ changed: 0, modified: 1 });
    filter.setModel({ filterType: 'set', values: ['Value 49999'] });
    expect(filter.getModel()).toEqual({ filterType: 'set', values: ['Value 49999'] });
    filter.setModel(null);
    expect(filter.getModel()).toBeNull();
  });

  it('selects only mini-filtered values and keeps blank values distinct from undefined', () => {
    const filter = new SetFilter();
    const events = { changed: 0, modified: 0 };
    filter.init({
      values: ['UK', 'US', null, undefined] as never,
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined },
      context: undefined,
      colDef: {},
      column: {} as never,
      getValue: () => null,
      doesRowPassOtherFilter: () => true,
      rowModel: {} as never,
      filterChangedCallback: () => events.changed++,
      filterModifiedCallback: () => events.modified++,
    });

    const selectAll = () => filter.getGui().querySelector<HTMLInputElement>('.lgr-set-filter > label > input');
    expect(selectAll()).toBeTruthy();
    selectAll()!.checked = false;
    selectAll()!.dispatchEvent(new Event('change'));
    filter.setMiniFilter('UK');
    selectAll()!.checked = true;
    selectAll()!.dispatchEvent(new Event('change'));

    expect(filter.getModel()).toEqual({ filterType: 'set', values: ['UK'] });
    expect(filter.getFilterKeys()).toEqual([null, '__libregrid_undefined__', 'UK', 'US']);
    expect(filter.getFilterValues()).toEqual([null, undefined, 'UK', 'US']);
    expect(events).toEqual({ changed: 2, modified: 3 });
  });

  it('renders tree-list paths and allows a branch to be selected as a unit', () => {
    const filter = new SetFilter();
    filter.init({
      values: ['Europe/UK', 'Europe/DE', 'Americas/US'],
      treeList: true,
      treeListPathGetter: (value) => value?.split('/') ?? null,
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined },
      context: undefined,
      colDef: {},
      column: {} as never,
      getValue: () => null,
      doesRowPassOtherFilter: () => true,
      rowModel: {} as never,
      filterChangedCallback: () => undefined,
      filterModifiedCallback: () => undefined,
    });

    expect(filter.getGui().textContent).toContain('Europe');
    const europe = filter.getGui().querySelector<HTMLInputElement>('.lgr-set-filter-tree-group input[aria-label="Europe"]');
    europe!.checked = false;
    europe!.dispatchEvent(new Event('change'));
    expect(filter.getModel()).toEqual({ filterType: 'set', values: ['Americas/US'] });
  });

  it('uses key and value formatters without changing the persisted model key', () => {
    const filter = new SetFilter();
    filter.init({
      values: [{ code: 'UK', label: 'United Kingdom' }],
      keyCreator: ({ value }) => (value as { code: string }).code,
      valueFormatter: ({ value }) => (value as { label: string }).label,
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined },
      context: undefined,
      colDef: {},
      column: {} as never,
      getValue: () => null,
      doesRowPassOtherFilter: () => true,
      rowModel: {} as never,
      filterChangedCallback: () => undefined,
      filterModifiedCallback: () => undefined,
    } as never);

    expect(filter.getFilterKeys()).toEqual(['UK']);
    expect(filter.getGui().textContent).toContain('United Kingdom');
  });

  it('honours parameter controls, custom rendering, and closes after an applied action', () => {
    const filter = new SetFilter();
    const hidePopup = vi.fn();
    filter.init({
      values: ['B', 'A'],
      suppressSorting: true,
      suppressMiniFilter: true,
      suppressSelectAll: true,
      cellHeight: 44,
      cellRenderer: ({ value }: { value: string }) => `Rendered ${value}`,
      buttons: ['apply', 'clear', 'cancel'],
      closeOnApply: true,
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined }, context: undefined, colDef: {}, column: {} as never,
      getValue: () => null, doesRowPassOtherFilter: () => true, rowModel: {} as never,
      filterChangedCallback: () => undefined, filterModifiedCallback: () => undefined,
    } as never);
    filter.afterGuiAttached({ hidePopup });
    expect(filter.getGui().querySelector('[aria-label="Search filter values"]')).toBeNull();
    expect(filter.getGui().querySelector('.lgr-set-filter > label > input')).toBeNull();
    expect(filter.getGui().textContent).toContain('Rendered B');
    expect(filter.getGui().querySelector<HTMLElement>('.lgr-set-filter-value')?.style.height).toBe('44px');
    filter.getGui().querySelector<HTMLButtonElement>('button')!.click();
    expect(hidePopup).toHaveBeenCalledOnce();
  });

  it('keeps the active model on refresh when requested and ignores values resolving after destruction', () => {
    let resolveValues: ((values: string[]) => void) | undefined;
    const filter = new SetFilter();
    filter.init({
      values: ({ success }: { success: (values: string[]) => void }) => { resolveValues = success; },
      suppressClearModelOnRefreshValues: true,
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined }, context: undefined, colDef: {}, column: {} as never,
      getValue: () => null, doesRowPassOtherFilter: () => true, rowModel: {} as never,
      filterChangedCallback: () => undefined, filterModifiedCallback: () => undefined,
    } as never);
    filter.setModel({ filterType: 'set', values: ['UK'] });
    filter.refreshFilterValues();
    resolveValues?.(['UK']);
    expect(filter.getModel()).toEqual({ filterType: 'set', values: ['UK'] });
    filter.destroy();
    resolveValues?.(['US']);
    expect(filter.getGui().childElementCount).toBe(0);
  });

  it('applies case sensitivity and fires one changed event for one bulk selection', () => {
    const filter = new SetFilter();
    const changed = vi.fn();
    filter.init({
      values: ['UK', 'us'], caseSensitive: true,
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined }, context: undefined, colDef: {}, column: {} as never,
      getValue: () => null, doesRowPassOtherFilter: () => true, rowModel: {} as never,
      filterChangedCallback: changed, filterModifiedCallback: () => undefined,
    });
    filter.setMiniFilter('u');
    expect(filter.getGui().querySelectorAll('.lgr-set-filter-value')).toHaveLength(1);
    const selectAll = filter.getGui().querySelector<HTMLInputElement>('.lgr-set-filter > label > input')!;
    selectAll.checked = false;
    selectAll.dispatchEvent(new Event('change'));
    expect(changed).toHaveBeenCalledOnce();
  });

  it('honours comparator, default selection, and Excel staged actions', () => {
    const filter = new SetFilter();
    filter.init({
      values: ['B', 'A'], defaultToNothingSelected: true, comparator: (a, b) => String(b).localeCompare(String(a)),
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined }, context: undefined, colDef: {}, column: {} as never,
      getValue: () => null, doesRowPassOtherFilter: () => true, rowModel: {} as never,
      filterChangedCallback: () => undefined, filterModifiedCallback: () => undefined,
    });
    expect(filter.getModel()).toEqual({ filterType: 'set', values: [] });
    expect([...filter.getGui().querySelectorAll('.lgr-set-filter-value span')].map((item) => item.textContent)).toEqual(['B', 'A']);

    const excel = new SetFilter();
    excel.init({
      values: ['UK'], defaultToNothingSelected: true, excelMode: 'windows',
      api: { forEachLeafNode: () => undefined, getGridOption: () => undefined }, context: undefined, colDef: {}, column: {} as never,
      getValue: () => null, doesRowPassOtherFilter: () => true, rowModel: {} as never,
      filterChangedCallback: () => undefined, filterModifiedCallback: () => undefined,
    });
    expect(excel.getModel()).toBeNull();
    expect(excel.getGui().textContent).toContain('Apply');
    expect(excel.getGui().textContent).toContain('Cancel');
  });
});

// [libregrid-fortis] Neurotrading (Danielle Gurgel), 2026-11-21.
describe('SetFilter (libregrid-fortis)', () => {
  const attached: HTMLElement[] = [];

  afterEach(() => {
    for (const element of attached.splice(0)) element.remove();
  });

  const params = (extra: Record<string, unknown>, gridOptions: Record<string, unknown> = {}) =>
    ({
      api: { forEachLeafNode: () => undefined, getGridOption: (key: string) => gridOptions[key] },
      context: undefined,
      colDef: {},
      column: {} as never,
      getValue: () => null,
      doesRowPassOtherFilter: () => true,
      rowModel: {} as never,
      filterChangedCallback: () => undefined,
      filterModifiedCallback: () => undefined,
      ...extra,
    }) as never;

  const attach = (filter: SetFilter): HTMLElement => {
    const gui = filter.getGui();
    document.body.appendChild(gui);
    attached.push(gui);
    return gui;
  };

  const valueBox = (gui: HTMLElement, label: string): HTMLInputElement =>
    [...gui.querySelectorAll<HTMLLabelElement>('.lgr-set-filter-value')]
      .find((row) => row.textContent === label)!
      .querySelector('input')!;

  it("takes its texts from the grid's locale, under AG Grid's Set Filter keys", () => {
    const filter = new SetFilter();
    filter.init(
      params(
        { values: ['UK', null], buttons: ['apply'] },
        {
          localeText: {
            searchOoo: 'Pesquisar...',
            ariaSearchFilterValues: 'Pesquisar valores de filtro',
            selectAll: '(Selecionar Todos)',
            blanks: '(Em Branco)',
            ariaFilterList: 'Lista de Filtros',
            applyFilter: 'Aplicar',
          },
        },
      ),
    );
    const gui = filter.getGui();
    const search = gui.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(search.placeholder).toBe('Pesquisar...');
    expect(search.getAttribute('aria-label')).toBe('Pesquisar valores de filtro');
    expect(gui.querySelector('.lgr-set-filter > label')!.textContent).toBe('(Selecionar Todos)');
    expect(gui.querySelector('.lgr-set-filter > label > input')!.hasAttribute('aria-label')).toBe(false);
    expect(gui.querySelector('.lgr-set-filter-list')!.getAttribute('aria-label')).toBe('Lista de Filtros');
    expect(gui.textContent).toContain('(Em Branco)');
    expect(gui.querySelector('.lgr-set-filter-actions button')!.textContent).toBe('Aplicar');

    const withCallback = new SetFilter();
    withCallback.init(
      params(
        { values: ['UK'] },
        {
          localeText: { selectAll: 'from the map' },
          getLocaleText: ({ key, defaultValue }: { key: string; defaultValue: string }) =>
            key === 'selectAll' ? 'from the callback' : defaultValue,
        },
      ),
    );
    expect(withCallback.getGui().querySelector('.lgr-set-filter > label')!.textContent).toBe('from the callback');
  });

  // One group level (the continent) and the values as its leaves, the way a date filter has year › month and the day.
  const treeFilter = () => {
    const filter = new SetFilter();
    filter.init(
      params({
        values: ['Europe/UK', 'Europe/DE', 'Americas/US'],
        treeList: true,
        treeListPathGetter: (value: string | null) => (value ? [value.split('/')[0]!] : null),
      }),
    );
    const gui = filter.getGui();
    const toggle = (label: string) =>
      gui.querySelector<HTMLButtonElement>(`.lgr-set-filter-tree-group > button[aria-label="${label}"]`)!;
    return { filter, gui, toggle };
  };

  it('opens the tree with its top level only, and keeps a group as the user leaves it, also through a selection redraw', () => {
    const { gui, toggle } = treeFilter();

    expect(toggle('Europe').getAttribute('aria-expanded')).toBe('false');
    expect(gui.textContent).toContain('Europe');
    expect(gui.textContent).not.toContain('Europe/UK');

    toggle('Europe').click();
    expect(toggle('Europe').getAttribute('aria-expanded')).toBe('true');
    expect(gui.textContent).toContain('Europe/UK');

    const americas = gui.querySelector<HTMLInputElement>('.lgr-set-filter-tree-group input[aria-label="Americas"]')!;
    americas.checked = false;
    americas.dispatchEvent(new Event('change'));
    expect(toggle('Europe').getAttribute('aria-expanded')).toBe('true');
    expect(gui.textContent).toContain('Europe/UK');

    toggle('Europe').click();
    expect(toggle('Europe').getAttribute('aria-expanded')).toBe('false');
    expect(gui.textContent).not.toContain('Europe/UK');
  });

  it('opens every group while searching, and brings back the groups the user had open after', () => {
    const { filter, gui, toggle } = treeFilter();
    toggle('Americas').click();

    filter.setMiniFilter('U');
    expect(toggle('Europe').getAttribute('aria-expanded')).toBe('true');
    expect(gui.textContent).toContain('Europe/UK');
    expect(gui.textContent).toContain('Americas/US');

    toggle('Europe').click();
    expect(gui.textContent).not.toContain('Europe/UK');

    filter.setMiniFilter('UK');
    expect(gui.textContent).toContain('Europe/UK');

    filter.setMiniFilter(null);
    expect(toggle('Europe').getAttribute('aria-expanded')).toBe('false');
    expect(toggle('Americas').getAttribute('aria-expanded')).toBe('true');
    expect(gui.textContent).not.toContain('Europe/UK');
    expect(gui.textContent).toContain('Americas/US');
  });

  it('keeps the focus on the value clicked through every redraw a handler-backed filter gets', () => {
    const onModelChange = vi.fn();
    const onStateChange = vi.fn();
    const managed = (model: unknown) =>
      params({ values: ['UK', 'US', 'DE'], model, state: { model }, onModelChange, onStateChange, onUiChange: () => undefined });
    const filter = new SetFilter();
    filter.init(managed(null));
    const gui = attach(filter);

    const clicked = valueBox(gui, 'US');
    clicked.focus();
    clicked.click();

    // The click redrew the list: the box clicked is gone, and its twin has the focus.
    expect(clicked.isConnected).toBe(false);
    expect(document.activeElement).toBe(valueBox(gui, 'US'));
    const model = { filterType: 'set', values: ['DE', 'UK'] };
    expect(onModelChange).toHaveBeenCalledWith(model, { source: 'ui' });

    // AG Grid then sends the new model back, and the filter redraws again.
    filter.refresh(managed(model));
    expect(document.activeElement).toBe(valueBox(gui, 'US'));
    expect(valueBox(gui, 'US').checked).toBe(false);
  });

  it('keeps the focus and the caret in the search box through a redraw', () => {
    const filter = new SetFilter();
    filter.init(params({ values: ['UK', 'US'] }));
    const gui = attach(filter);
    const search = () => gui.querySelector<HTMLInputElement>('input[type="search"]')!;
    search().value = 'US';
    filter.setMiniFilter('US');
    search().focus();
    search().setSelectionRange(1, 1);

    filter.setModel({ filterType: 'set', values: ['US'] });

    expect(document.activeElement).toBe(search());
    expect(search().value).toBe('US');
    expect([search().selectionStart, search().selectionEnd]).toEqual([1, 1]);
  });

  it('keeps the focus inside the filter when the focused value leaves the list', () => {
    const filter = new SetFilter();
    filter.init(params({ values: ['UK', 'US', 'DE'] }));
    const gui = attach(filter);
    valueBox(gui, 'US').focus();

    filter.setMiniFilter('DE');

    expect(document.activeElement).toBe(gui);
  });
});
