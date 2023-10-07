'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Caveat } from 'next/font/google';

import { useFieldArray, useForm } from 'react-hook-form';

import { getBoundingClientRect } from '@documenso/lib/client-only/get-bounding-client-rect';
import { useDocumentElement } from '@documenso/lib/client-only/hooks/use-document-element';
import { PDF_VIEWER_PAGE_SELECTOR } from '@documenso/lib/constants/pdf-viewer';
import { nanoid } from '@documenso/lib/universal/id';
import { Field, FieldType } from '@documenso/prisma/client';
import { cn } from '@documenso/ui/lib/utils';
import { Card, CardContent } from '@documenso/ui/primitives/card';

import { TAddTemplateFieldsFormSchema } from './add-template-fields.types';
import {
  DocumentFlowFormContainerActions,
  DocumentFlowFormContainerContent,
  DocumentFlowFormContainerFooter,
  DocumentFlowFormContainerStep,
} from './document-flow-root';
import { FieldItem } from './field-item';
import { DocumentFlowStep, FRIENDLY_FIELD_TYPE } from './types';

const fontCaveat = Caveat({
  weight: ['500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-caveat',
});

const DEFAULT_HEIGHT_PERCENT = 5;
const DEFAULT_WIDTH_PERCENT = 15;

const MIN_HEIGHT_PX = 60;
const MIN_WIDTH_PX = 200;

export type AddTemplateFieldsFormProps = {
  documentFlow: DocumentFlowStep;
  fields: Field[];
  numberOfSteps: number;
  onSubmit: (_data: TAddTemplateFieldsFormSchema) => void;
};

export const AddTemplateFieldsFormPartial = ({
  documentFlow,
  fields,
  numberOfSteps,
  onSubmit,
}: AddTemplateFieldsFormProps) => {
  const { isWithinPageBounds, getFieldPosition, getPage } = useDocumentElement();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TAddTemplateFieldsFormSchema>({
    defaultValues: {
      fields: fields.map((field) => ({
        nativeId: field.id,
        formId: `${field.id}-${field.documentId}`,
        pageNumber: field.page,
        type: field.type,
        pageX: Number(field.positionX),
        pageY: Number(field.positionY),
        pageWidth: Number(field.width),
        pageHeight: Number(field.height),
      })),
    },
  });

  const onFormSubmit = handleSubmit(onSubmit);

  const {
    append,
    remove,
    update,
    fields: localFields,
  } = useFieldArray({
    control,
    name: 'fields',
  });

  const [selectedField, setSelectedField] = useState<FieldType | null>(null);

  const [isFieldWithinBounds, setIsFieldWithinBounds] = useState(false);
  const [coords, setCoords] = useState({
    x: 0,
    y: 0,
  });

  const fieldBounds = useRef({
    height: 0,
    width: 0,
  });

  const onMouseMove = useCallback(
    (event: MouseEvent) => {
      setIsFieldWithinBounds(
        isWithinPageBounds(
          event,
          PDF_VIEWER_PAGE_SELECTOR,
          fieldBounds.current.width,
          fieldBounds.current.height,
        ),
      );

      setCoords({
        x: event.clientX - fieldBounds.current.width / 2,
        y: event.clientY - fieldBounds.current.height / 2,
      });
    },
    [isWithinPageBounds],
  );

  const onMouseClick = useCallback(
    (event: MouseEvent) => {
      if (!selectedField) {
        return;
      }

      const $page = getPage(event, PDF_VIEWER_PAGE_SELECTOR);

      if (
        !$page ||
        !isWithinPageBounds(
          event,
          PDF_VIEWER_PAGE_SELECTOR,
          fieldBounds.current.width,
          fieldBounds.current.height,
        )
      ) {
        setSelectedField(null);
        return;
      }

      const { top, left, height, width } = getBoundingClientRect($page);

      const pageNumber = parseInt($page.getAttribute('data-page-number') ?? '1', 10);

      // Calculate x and y as a percentage of the page width and height
      let pageX = ((event.pageX - left) / width) * 100;
      let pageY = ((event.pageY - top) / height) * 100;

      // Get the bounds as a percentage of the page width and height
      const fieldPageWidth = (fieldBounds.current.width / width) * 100;
      const fieldPageHeight = (fieldBounds.current.height / height) * 100;

      // And center it based on the bounds
      pageX -= fieldPageWidth / 2;
      pageY -= fieldPageHeight / 2;

      append({
        formId: nanoid(12),
        type: selectedField,
        pageNumber,
        pageX,
        pageY,
        pageWidth: fieldPageWidth,
        pageHeight: fieldPageHeight,
      });

      setIsFieldWithinBounds(false);
      setSelectedField(null);
    },
    [append, isWithinPageBounds, selectedField, getPage],
  );

  const onFieldResize = useCallback(
    (node: HTMLElement, index: number) => {
      const field = localFields[index];

      const $page = window.document.querySelector<HTMLElement>(
        `${PDF_VIEWER_PAGE_SELECTOR}[data-page-number="${field.pageNumber}"]`,
      );

      if (!$page) {
        return;
      }

      const {
        x: pageX,
        y: pageY,
        width: pageWidth,
        height: pageHeight,
      } = getFieldPosition($page, node);

      update(index, {
        ...field,
        pageX,
        pageY,
        pageWidth,
        pageHeight,
      });
    },
    [getFieldPosition, localFields, update],
  );

  const onFieldMove = useCallback(
    (node: HTMLElement, index: number) => {
      const field = localFields[index];

      const $page = window.document.querySelector<HTMLElement>(
        `${PDF_VIEWER_PAGE_SELECTOR}[data-page-number="${field.pageNumber}"]`,
      );

      if (!$page) {
        return;
      }

      const { x: pageX, y: pageY } = getFieldPosition($page, node);

      update(index, {
        ...field,
        pageX,
        pageY,
      });
    },
    [getFieldPosition, localFields, update],
  );

  useEffect(() => {
    if (selectedField) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('click', onMouseClick);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onMouseClick);
    };
  }, [onMouseClick, onMouseMove, selectedField]);

  useEffect(() => {
    const observer = new MutationObserver((_mutations) => {
      const $page = document.querySelector(PDF_VIEWER_PAGE_SELECTOR);

      if (!$page) {
        return;
      }

      const { height, width } = $page.getBoundingClientRect();

      fieldBounds.current = {
        height: Math.max(height * (DEFAULT_HEIGHT_PERCENT / 100), MIN_HEIGHT_PX),
        width: Math.max(width * (DEFAULT_WIDTH_PERCENT / 100), MIN_WIDTH_PX),
      };
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <DocumentFlowFormContainerContent>
        <div className="flex flex-col">
          {selectedField && (
            <Card
              className={cn(
                'bg-background pointer-events-none fixed z-50 cursor-pointer transition-opacity',
                {
                  'border-primary': isFieldWithinBounds,
                  'opacity-50': !isFieldWithinBounds,
                },
              )}
              style={{
                top: coords.y,
                left: coords.x,
                height: fieldBounds.current.height,
                width: fieldBounds.current.width,
              }}
            >
              <CardContent className="text-foreground flex h-full w-full items-center justify-center p-2">
                {FRIENDLY_FIELD_TYPE[selectedField]}
              </CardContent>
            </Card>
          )}

          {localFields.map((field, index) => (
            <FieldItem
              key={index}
              field={field}
              minHeight={fieldBounds.current.height}
              minWidth={fieldBounds.current.width}
              passive={isFieldWithinBounds && !!selectedField}
              onResize={(options) => onFieldResize(options, index)}
              onMove={(options) => onFieldMove(options, index)}
              onRemove={() => remove(index)}
            />
          ))}

          <div className="-mx-2 flex-1 overflow-y-auto px-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-8">
              <button
                type="button"
                className="group h-full w-full"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={() => setSelectedField(FieldType.SIGNATURE)}
                data-selected={selectedField === FieldType.SIGNATURE ? true : undefined}
              >
                <Card className="group-data-[selected]:border-documenso h-full w-full cursor-pointer group-disabled:opacity-50">
                  <CardContent className="flex flex-col items-center justify-center px-6 py-4">
                    <p
                      className={cn(
                        'text-muted-foreground group-data-[selected]:text-foreground w-full truncate text-3xl font-medium',
                        fontCaveat.className,
                      )}
                    >
                      Signature
                    </p>

                    <p className="text-muted-foreground mt-2 text-center text-xs">Signature</p>
                  </CardContent>
                </Card>
              </button>

              <button
                type="button"
                className="group h-full w-full"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={() => setSelectedField(FieldType.EMAIL)}
                data-selected={selectedField === FieldType.EMAIL ? true : undefined}
              >
                <Card className="group-data-[selected]:border-documenso h-full w-full cursor-pointer group-disabled:opacity-50">
                  <CardContent className="flex flex-col items-center justify-center px-6 py-4">
                    <p
                      className={cn(
                        'text-muted-foreground group-data-[selected]:text-foreground text-xl font-medium',
                      )}
                    >
                      {'Email'}
                    </p>

                    <p className="text-muted-foreground mt-2 text-xs">Email</p>
                  </CardContent>
                </Card>
              </button>

              <button
                type="button"
                className="group h-full w-full"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={() => setSelectedField(FieldType.NAME)}
                data-selected={selectedField === FieldType.NAME ? true : undefined}
              >
                <Card className="group-data-[selected]:border-documenso h-full w-full cursor-pointer group-disabled:opacity-50">
                  <CardContent className="flex flex-col items-center justify-center px-6 py-4">
                    <p
                      className={cn(
                        'text-muted-foreground group-data-[selected]:text-foreground text-xl font-medium',
                      )}
                    >
                      {'Name'}
                    </p>

                    <p className="text-muted-foreground mt-2 text-xs">Name</p>
                  </CardContent>
                </Card>
              </button>

              <button
                type="button"
                className="group h-full w-full"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={() => setSelectedField(FieldType.DATE)}
                data-selected={selectedField === FieldType.DATE ? true : undefined}
              >
                <Card className="group-data-[selected]:border-documenso h-full w-full cursor-pointer group-disabled:opacity-50">
                  <CardContent className="flex flex-col items-center justify-center px-6 py-4">
                    <p
                      className={cn(
                        'text-muted-foreground group-data-[selected]:text-foreground text-xl font-medium',
                      )}
                    >
                      {'Date'}
                    </p>

                    <p className="text-muted-foreground mt-2 text-xs">Date</p>
                  </CardContent>
                </Card>
              </button>
            </div>
          </div>
        </div>
      </DocumentFlowFormContainerContent>

      <DocumentFlowFormContainerFooter>
        <DocumentFlowFormContainerStep
          title={documentFlow.title}
          step={documentFlow.stepIndex}
          maxStep={numberOfSteps}
        />

        <DocumentFlowFormContainerActions
          loading={isSubmitting}
          disabled={isSubmitting}
          onGoBackClick={() => {
            documentFlow.onBackStep?.();
            remove();
          }}
          onGoNextClick={() => void onFormSubmit()}
        />
      </DocumentFlowFormContainerFooter>
    </>
  );
};
