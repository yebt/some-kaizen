import { describe, expect, it } from 'vitest'

import { frequency, onWeekdays } from '@modules/habits/domain/habit'

import { describeFrequency } from './frequency-label'

describe('writing a recurrence the way someone would say it', () => {
  it('counts the times when the days are not named', () => {
    expect(describeFrequency(frequency('weekly', 3))).toBe('3 times a week')
  })

  it('says once rather than one time', () => {
    expect(describeFrequency(frequency('monthly', 1))).toBe('Once a month')
  })

  it('lists the days when they are named', () => {
    expect(describeFrequency(onWeekdays([1, 3, 5]))).toBe('Mon, Wed, Fri')
  })

  it('keeps them in week order however they were ticked', () => {
    expect(describeFrequency(onWeekdays([5, 1, 3]))).toBe('Mon, Wed, Fri')
  })

  it('calls the working week what it is', () => {
    // A list you have to read, versus a thing you already know.
    expect(describeFrequency(onWeekdays([1, 2, 3, 4, 5]))).toBe('Weekdays')
  })

  it('names the weekend too', () => {
    expect(describeFrequency(onWeekdays([6, 7]))).toBe('Weekends')
  })

  it('says every day rather than listing all seven', () => {
    expect(describeFrequency(onWeekdays([1, 2, 3, 4, 5, 6, 7]))).toBe('Every day')
  })
})
