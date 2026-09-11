import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('themes')
export class Theme {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 7, nullable: true })
  primaryColor: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  secondaryColor: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fontFamily: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl: string;

  @Column({ type: 'varchar', nullable: true })
  backgroundImageUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brandingText: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
