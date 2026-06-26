function resolveChoiceKeys(choices) {
    if (!choices) return null;
    if (Array.isArray(choices)) return choices.map((value) => String(value));
    if (choices instanceof Set) return [...choices].map((value) => String(value));
    if (typeof choices === "object") return Object.keys(choices);
    return null;
}

function fieldKind(field) {
    return field?.constructor?.name ?? "";
}

function getSchemaFields(schemaField) {
    return schemaField?.fields ?? schemaField?.schema ?? {};
}

function getArrayElementField(arrayField) {
    return arrayField?.element ?? arrayField?.field ?? null;
}

function collectChoiceIssuesFromField({
    field,
    value,
    path,
    pushIssue
}) {
    const kind = fieldKind(field);

    if (kind === "SchemaField") {
        const fields = getSchemaFields(field);
        for (const [key, nestedField] of Object.entries(fields)) {
            const nestedValue = value?.[key];
            collectChoiceIssuesFromField({
                field: nestedField,
                value: nestedValue,
                path: `${path}.${key}`,
                pushIssue
            });
        }
        return;
    }

    if (kind === "ArrayField") {
        const elementField = getArrayElementField(field);
        if (!elementField || !Array.isArray(value)) return;

        for (let index = 0; index < value.length; index += 1) {
            collectChoiceIssuesFromField({
                field: elementField,
                value: value[index],
                path: `${path}[${index}]`,
                pushIssue
            });
        }
        return;
    }

    if (kind !== "StringField") return;

    const allowedChoices = resolveChoiceKeys(field?.options?.choices);
    if (!allowedChoices || typeof value !== "string" || !value.length) return;

    if (!allowedChoices.includes(value)) {
        pushIssue({
            path,
            value,
            allowedChoices
        });
    }
}

function getDataModelClass(documentType, entryType) {
    if (documentType === "Actor") return CONFIG?.Actor?.dataModels?.[entryType] ?? null;
    if (documentType === "Item") return CONFIG?.Item?.dataModels?.[entryType] ?? null;
    return null;
}

export function validateStarterCompendiumPlans(plans) {
    const issues = [];

    for (const plan of plans) {
        for (const entry of plan.entries) {
            const modelClass = getDataModelClass(plan.documentType, entry.type);
            const schema = modelClass?.schema ?? modelClass?.defineSchema?.();
            if (!schema || !entry?.system || typeof entry.system !== "object") continue;

            for (const [key, field] of Object.entries(schema)) {
                collectChoiceIssuesFromField({
                    field,
                    value: entry.system[key],
                    path: `system.${key}`,
                    pushIssue: ({ path, value, allowedChoices }) => {
                        issues.push({
                            packName: plan.packName,
                            documentType: plan.documentType,
                            entryName: entry.name,
                            entryType: entry.type,
                            path,
                            value,
                            allowedChoices
                        });
                    }
                });
            }
        }
    }

    return issues;
}

export function formatStarterCompendiumPreflightError(issues) {
    const maxIssues = 12;
    const details = issues.slice(0, maxIssues).map((issue) => {
        const allowedPreview = issue.allowedChoices.slice(0, 10).join(", ");
        const allowedSuffix = issue.allowedChoices.length > 10 ? ", ..." : "";
        return [
            `[${issue.packName}] ${issue.documentType} "${issue.entryName}" (${issue.entryType})`,
            `  ${issue.path}: "${issue.value}" is not a valid choice.`,
            `  Allowed: ${allowedPreview}${allowedSuffix}`
        ].join("\n");
    });

    const remaining = issues.length - maxIssues;
    if (remaining > 0) {
        details.push(`...and ${remaining} more issue(s).`);
    }

    return [
        `Starter compendium preflight failed with ${issues.length} issue(s).`,
        "Fix the sample content or schema choice lists, then rerun the migration.",
        "",
        ...details
    ].join("\n");
}
