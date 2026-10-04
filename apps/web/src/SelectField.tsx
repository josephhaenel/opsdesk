import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  describedBy?: string;
  placeholder?: string;
}

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  describedBy,
  placeholder = 'Choose an option',
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const fieldRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const selected = options.find((option) => option.value === value);
  const enabledIndices = options.flatMap((option, index) => (option.disabled ? [] : [index]));
  const unavailable = disabled || enabledIndices.length === 0;
  const labelId = `${id}-label`;
  const listId = `${id}-listbox`;

  useEffect(() => {
    if (unavailable) setOpen(false);
  }, [unavailable]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !fieldRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = optionRefs.current[activeIndex];
    if (!list || !option) return;
    const bounds = list.getBoundingClientRect();
    const activeBounds = option.getBoundingClientRect();
    if (activeBounds.top < bounds.top) list.scrollTop -= bounds.top - activeBounds.top;
    else if (activeBounds.bottom > bounds.bottom) {
      list.scrollTop += activeBounds.bottom - bounds.bottom;
    }
  }, [open, activeIndex]);

  function openList(direction: 1 | -1 = 1) {
    if (unavailable) return;
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(
      selectedIndex >= 0
        ? selectedIndex
        : direction === 1
          ? enabledIndices[0]
          : enabledIndices[enabledIndices.length - 1],
    );
    setOpen(true);
  }

  function selectOption(index: number) {
    const option = options[index];
    if (!option || option.disabled || unavailable) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (unavailable) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        if (!open) openList(direction);
        else {
          const position = enabledIndices.indexOf(activeIndex);
          const nextPosition =
            position < 0
              ? direction === 1
                ? 0
                : enabledIndices.length - 1
              : (position + direction + enabledIndices.length) % enabledIndices.length;
          setActiveIndex(enabledIndices[nextPosition]);
        }
        break;
      }
      case 'Home':
      case 'End':
        event.preventDefault();
        setActiveIndex(
          event.key === 'Home' ? enabledIndices[0] : enabledIndices[enabledIndices.length - 1],
        );
        setOpen(true);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) selectOption(activeIndex);
        else openList();
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  return (
    <div
      className="select-field"
      ref={fieldRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="field-label select-label" id={labelId} htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className={`select-trigger${open ? ' is-open' : ''}`}
        ref={triggerRef}
        role="combobox"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        disabled={unavailable}
        onClick={() => {
          if (open) setOpen(false);
          else openList();
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="select-value">{selected?.label ?? placeholder}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open ? (
        <div className="select-popover">
          <ul
            className="select-listbox"
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            ref={listRef}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={`select-option${index === activeIndex ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}`}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                onMouseMove={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(index)}
              >
                <span className="select-option-content">
                  <span className="select-option-label">{option.label}</span>
                  {option.description ? (
                    <span className="select-option-description">{option.description}</span>
                  ) : null}
                </span>
                {option.value === value ? (
                  <Check size={16} className="select-option-check" aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
