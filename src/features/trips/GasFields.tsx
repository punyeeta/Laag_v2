import { useState } from 'react';
import { useCars } from '../../data/hooks';
import { saveCar } from '../../data/repo';
import type { TripGas } from '../../data/types';
import { gasCost, gasLiters, parseAmount } from '../../lib/calc';
import { pesoExact } from '../../lib/money';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';

/**
 * Car, distance, buffer and fuel price (US-10, BR-07). A car's km/L is typed
 * once and kept as a saved car. The trip copies the car's values, so editing
 * the car later doesn't change past trips.
 */
export function GasFields({ value, onChange }: { value: TripGas | null; onChange: (g: TripGas | null) => void }) {
  const cars = useCars();
  const [adding, setAdding] = useState(false);
  const [carName, setCarName] = useState('');
  const [kmPerL, setKmPerL] = useState('');
  const [fuelType, setFuelType] = useState('gasoline');
  const g: TripGas = value ?? { distanceKm: 0, kmPerL: 0, bufferPct: 10, fuelPrice: 0 };
  // Numbers save when you leave the field, so the log reads "from ₱92.00 to ₱95.22".
  const [priceText, setPriceText] = useState(g.fuelPrice ? String(g.fuelPrice / 100) : '');
  const [distText, setDistText] = useState(g.distanceKm ? String(g.distanceKm) : '');
  const [bufText, setBufText] = useState(String(g.bufferPct));
  const carId = Object.values(cars).find((c) => c.name === g.carName && c.kmPerL === g.kmPerL)?.id ?? '';

  const set = (patch: Partial<TripGas>) => onChange({ ...g, ...patch });

  return (
    <div className="space-y-4">
      <Field label="Car" hint="Pick a saved car or add a new one. Used for the gas estimate.">
        <Select
          value={adding ? '__new' : value ? carId : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__new') return setAdding(true);
            setAdding(false);
            if (!v) return onChange(null);
            const c = cars[v];
            set({ carName: c.name, kmPerL: c.kmPerL, fuelType: c.fuelType });
          }}
        >
          <option value="">No car (no gas estimate)</option>
          {Object.values(cars).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.kmPerL} km/L · {c.fuelType}
            </option>
          ))}
          {value && !carId && g.carName && <option value="">{g.carName} · {g.kmPerL} km/L (this trip)</option>}
          <option value="__new">Add a car…</option>
        </Select>
      </Field>

      {adding && (
        <div className="space-y-3 rounded-[12px] bg-surface p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Car name">
              <Input value={carName} onChange={(e) => setCarName(e.target.value)} placeholder="Vios" />
            </Field>
            <Field label="km per liter">
              <Input inputMode="decimal" value={kmPerL} onChange={(e) => setKmPerL(e.target.value)} placeholder="14" />
            </Field>
          </div>
          <Field label="Fuel">
            <Select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
              <option value="gasoline">Gasoline</option>
              <option value="diesel">Diesel</option>
            </Select>
          </Field>
          <Button
            disabled={!carName.trim() || !(Number(kmPerL) > 0)}
            onClick={() => {
              const c = saveCar({ name: carName.trim(), kmPerL: Number(kmPerL), fuelType });
              set({ carName: c.name, kmPerL: c.kmPerL, fuelType: c.fuelType });
              setAdding(false);
              setCarName('');
              setKmPerL('');
            }}
          >
            Save car
          </Button>
        </div>
      )}

      {value && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Round trip (km)" hint="From Google Maps">
              <Input
                inputMode="decimal"
                value={distText}
                onChange={(e) => setDistText(e.target.value)}
                onBlur={() => {
                  const v = Number(distText);
                  if (v >= 0 && v !== g.distanceKm) set({ distanceKm: v });
                }}
              />
            </Field>
            <Field label="Buffer (%)" hint="Traffic, detours">
              <Input
                inputMode="numeric"
                value={bufText}
                onChange={(e) => setBufText(e.target.value)}
                onBlur={() => {
                  const v = Number(bufText);
                  if (v >= 0 && v !== g.bufferPct) set({ bufferPct: v });
                }}
              />
            </Field>
          </div>
          <Field
            label="Fuel price (₱ per liter)"
            hint={g.fuelPriceCheckedAt ? `Checked ${g.fuelPriceCheckedAt}. Update it any time before the trip.` : 'Update it any time before the trip.'}
          >
            <Input
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              onBlur={() => {
                const r = parseAmount(priceText);
                if (r.ok && r.value !== g.fuelPrice) {
                  const d = new Date();
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  set({ fuelPrice: r.value, fuelPriceCheckedAt: iso });
                }
              }}
            />
          </Field>
          {g.kmPerL > 0 && g.distanceKm > 0 && g.fuelPrice > 0 && (
            <p className="tnum rounded-[12px] bg-surface p-3 text-sm">
              {g.distanceKm} km ÷ {g.kmPerL} km/L × {(1 + g.bufferPct / 100).toFixed(2)} = {gasLiters(g).toFixed(2)} L ×{' '}
              {pesoExact(g.fuelPrice)} = <strong>{pesoExact(gasCost(g))}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}
